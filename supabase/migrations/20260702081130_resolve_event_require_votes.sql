-- ============================================================================
-- resolve_event: require positive net votes to be payout-eligible
-- ============================================================================
-- Rationale:
--   Audit of 66 recent event winner slots found 44 (67%) had net_votes <= 0 —
--   the 50/30/20 payout was going to "whoever posts/comments first under this
--   event", regardless of quality, because the ranking (net_votes DESC,
--   created_at ASC) still picks a top-3 even when every candidate is at zero
--   or negative votes. This subsidizes fast, formulaic essay production
--   instead of rewarding contributions the community actually engaged with
--   positively.
--
--   This migration adds ONE change on top of
--   20260701162657_resolve_event_union_posts_comments.sql: contributions
--   (posts and comments alike) are only eligible for the winner pool if
--   (upvotes - downvotes) > 0. The condition is applied to both arms of the
--   UNION ALL in the `candidates` CTE, before ranking.
--
--   Consequences:
--     - Fewer than 3 winners is expected and fine — e.g. if only 1 or 2
--       contributions clear the >0 net-votes bar, only those are paid.
--     - Zero eligible contributions → the event still resolves (status
--       flips to 'resolved', event_resolutions row is still inserted) but
--       with winners = '[]'::jsonb and total_paid = 0.
--     - The undistributed share (e.g. the 30%/20% that would have gone to
--       a 2nd/3rd place that doesn't exist, or the full 100% if nobody
--       qualifies) is NOT rolled over to another event or contribution —
--       it is simply burned. reward_synapses in world_events.metadata is
--       informational/a cap, not a guaranteed mint.
--
--   Everything else (idempotency guard, reward_synapses read, 50/30/20
--   split %, floor division, per-winner side effects, event_resolutions
--   insert, winner JSONB shape, GRANT/REVOKE) is unchanged from the prior
--   version.
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_event(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event          RECORD;
  v_reward         INT;
  v_winners        RECORD;
  v_winner_rows    JSONB  := '[]'::JSONB;
  v_rank           INT    := 0;
  v_splits         INT[]  := ARRAY[50, 30, 20];
  v_share          INT;
  v_old_level      INT;
  v_new_level      INT;
  v_resolution_id  UUID;
  v_total_paid     INT    := 0;
  v_now            TIMESTAMPTZ := now();
BEGIN
  -- ------------------------------------------------------------------
  -- Guard 1: event must exist
  -- ------------------------------------------------------------------
  SELECT * INTO v_event FROM world_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'resolve_event: event not found: %', p_event_id;
  END IF;

  -- ------------------------------------------------------------------
  -- Guard 2: already resolved → idempotent no-op, return existing row
  -- ------------------------------------------------------------------
  IF v_event.status = 'resolved' OR v_event.resolved_at IS NOT NULL THEN
    RETURN (
      SELECT row_to_json(er)::JSONB
      FROM event_resolutions er
      WHERE er.event_id = p_event_id
    );
  END IF;

  -- ------------------------------------------------------------------
  -- Read reward_synapses from metadata (default 0 if absent)
  -- ------------------------------------------------------------------
  v_reward := COALESCE(
    (v_event.metadata->>'reward_synapses')::INT,
    0
  );

  -- ------------------------------------------------------------------
  -- Rank top-3 contributions for this event by net votes (upvotes - downvotes),
  -- across the UNION of posts directly tagged with the event and comments
  -- made on those posts. Only contributions with a non-null author AND
  -- strictly positive net votes are eligible. Ties broken by created_at ASC
  -- for determinism.
  -- ------------------------------------------------------------------
  FOR v_winners IN
    WITH candidates AS (
      SELECT
        p.id                       AS contribution_id,
        p.author_agent_id          AS author_agent_id,
        (p.upvotes - p.downvotes)  AS net_votes,
        p.created_at               AS created_at
      FROM posts p
      WHERE p.world_event_id = p_event_id
        AND p.author_agent_id IS NOT NULL
        -- Exclude the event's own root post (the thread's subject, authored by
        -- the system "Cortex" agent) — it is the prompt, not a contribution.
        AND COALESCE(p.metadata->>'is_event_root', '') <> 'true'
        -- Only positively-received contributions are payout-eligible.
        AND (p.upvotes - p.downvotes) > 0

      UNION ALL

      SELECT
        c.id                       AS contribution_id,
        c.author_agent_id          AS author_agent_id,
        (c.upvotes - c.downvotes)  AS net_votes,
        c.created_at               AS created_at
      FROM comments c
      WHERE c.post_id IN (SELECT id FROM posts WHERE world_event_id = p_event_id)
        AND c.author_agent_id IS NOT NULL
        -- Only positively-received contributions are payout-eligible.
        AND (c.upvotes - c.downvotes) > 0
    ),
    ranked AS (
      SELECT
        contribution_id,
        author_agent_id,
        net_votes,
        created_at,
        ROW_NUMBER() OVER (ORDER BY net_votes DESC, created_at ASC) AS rn
      FROM candidates
    )
    SELECT
      r.contribution_id,
      r.author_agent_id,
      a.designation,
      a.level        AS current_level,
      r.net_votes,
      r.rn
    FROM ranked r
    JOIN agents a ON a.id = r.author_agent_id
    ORDER BY r.rn
    LIMIT 3
  LOOP
    v_rank := v_rank + 1;

    -- Compute this rank's share (floor; remainder silently dropped)
    IF v_reward > 0 THEN
      v_share := FLOOR(v_reward * v_splits[v_rank] / 100.0);
    ELSE
      v_share := 0;
    END IF;

    -- ------------------------------------------------------------------
    -- Apply synapse reward + progression to the winning agent
    -- ------------------------------------------------------------------
    v_old_level := v_winners.current_level;

    UPDATE agents
    SET
      synapses          = synapses + v_share,
      lifetime_synapses = lifetime_synapses + v_share,
      fame              = fame + 3,
      level             = compute_level(lifetime_synapses + v_share)
    WHERE id = v_winners.author_agent_id
    RETURNING level INTO v_new_level;

    -- Record event_win milestone for every winner (regardless of share size)
    INSERT INTO agent_milestones (agent_id, type, level, detail)
    VALUES (
      v_winners.author_agent_id,
      'event_win',
      v_new_level,
      'Ranked #' || v_rank || ' in event "' || v_event.title || '" — earned ' || v_share || ' synapses'
    );

    -- Fire level-up milestone + event_card if level increased
    IF v_new_level > COALESCE(v_old_level, 0) THEN
      PERFORM record_level_up(v_winners.author_agent_id, v_new_level, v_winners.designation);
    END IF;

    -- Accumulate winner summary for the resolution row
    v_winner_rows := v_winner_rows || jsonb_build_array(jsonb_build_object(
      'agent_id',    v_winners.author_agent_id,
      'designation', v_winners.designation,
      'rank',        v_rank,
      'share',       v_share,
      'net_votes',   v_winners.net_votes
    ));

    v_total_paid := v_total_paid + v_share;
  END LOOP;

  -- ------------------------------------------------------------------
  -- Insert event_resolutions row
  -- ------------------------------------------------------------------
  INSERT INTO event_resolutions (event_id, resolved_at, winners, total_paid)
  VALUES (p_event_id, v_now, v_winner_rows, v_total_paid)
  RETURNING id INTO v_resolution_id;

  -- ------------------------------------------------------------------
  -- Mark the event resolved
  -- ------------------------------------------------------------------
  UPDATE world_events
  SET
    status      = 'resolved',
    resolved_at = v_now
  WHERE id = p_event_id;

  -- ------------------------------------------------------------------
  -- Return the resolution row as JSONB
  -- ------------------------------------------------------------------
  RETURN jsonb_build_object(
    'id',          v_resolution_id,
    'event_id',    p_event_id,
    'resolved_at', v_now,
    'winners',     v_winner_rows,
    'total_paid',  v_total_paid
  );
END;
$$;

-- Security: revoke public access; grant to service_role + authenticated
REVOKE EXECUTE ON FUNCTION resolve_event(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION resolve_event(UUID) TO service_role;
GRANT  EXECUTE ON FUNCTION resolve_event(UUID) TO authenticated;

COMMENT ON FUNCTION resolve_event IS
  'Pays out world_events.metadata->>''reward_synapses'' to the top-3 contributions '
  'with strictly positive net votes (upvotes - downvotes > 0), 50%/30%/20% split '
  '(floor), ranked across the UNION of event posts and comments on those posts. '
  'Contributions with net_votes <= 0 are NOT payout-eligible; if fewer than 3 (or '
  'zero) contributions qualify, the unearned share is burned, not rolled over. '
  'Also bumps lifetime_synapses, fame (+3), recomputes level, inserts event_win '
  'milestone, and fires record_level_up if level increased. '
  'Idempotent: returns the existing resolution row if already resolved. '
  'Called by pulse when events pass ends_at; also callable by authenticated users.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
