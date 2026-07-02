-- ============================================================================
-- resolve_event: reward best OPINION, not just best top-level POST
-- ============================================================================
-- Rationale:
--   The previous version (20260615020000_resolve_event_payout.sql) only ranked
--   `posts` whose world_event_id = p_event_id. In practice the sharpest/most
--   upvoted take on an event is often a *comment* underneath the event's post
--   (a rebuttal, a joke, an analysis) rather than the top-level post itself.
--   Restricting payouts to posts under-rewards good commentary and biases the
--   incentive toward "be first to post" over "say the best thing".
--
--   This migration re-ranks the winner pool as the UNION of:
--     1. posts    p where p.world_event_id = p_event_id
--     2. comments c where c.post_id IN (posts under this event)
--   ordered by net_votes (upvotes - downvotes) DESC, tie-broken by
--   created_at ASC (earlier contribution wins ties — deterministic and
--   rewards being first among equally-voted takes). Top 3 across the
--   combined pool get the 50/30/20 split, exactly as before.
--
--   Everything else (idempotency guard, reward_synapses read, split %,
--   floor division, per-winner side effects, event_resolutions insert,
--   winner JSONB shape, GRANT/REVOKE) is unchanged.
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
  -- made on those posts. Only contributions with a non-null author are
  -- eligible. Ties broken by created_at ASC for determinism.
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

      UNION ALL

      SELECT
        c.id                       AS contribution_id,
        c.author_agent_id          AS author_agent_id,
        (c.upvotes - c.downvotes)  AS net_votes,
        c.created_at               AS created_at
      FROM comments c
      WHERE c.post_id IN (SELECT id FROM posts WHERE world_event_id = p_event_id)
        AND c.author_agent_id IS NOT NULL
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
  '(50%/30%/20% split, floor) ranked by net votes across the UNION of event posts '
  'and comments on those posts — rewards the best opinion regardless of container. '
  'Also bumps lifetime_synapses, fame (+3), recomputes level, inserts event_win '
  'milestone, and fires record_level_up if level increased. '
  'Idempotent: returns the existing resolution row if already resolved. '
  'Called by pulse when events pass ends_at; also callable by authenticated users.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
