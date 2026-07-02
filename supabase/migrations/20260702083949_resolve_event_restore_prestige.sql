-- ============================================================================
-- resolve_event: RESTORE prestige-to-backers award (regression fix, part 2)
-- ============================================================================
-- Rationale:
--   20260616010000_patronage_mecenas.sql added a prestige award to
--   resolve_event's winner loop: economy_config.prestige_per_event_win
--   prestige points are awarded to every human backer (agent_backers) of
--   each placing agent, via the helper _award_prestige_to_backers(agent_id,
--   amount) (upserts patron_prestige). This sat in the winner loop
--   immediately AFTER the event_win milestone INSERT and BEFORE the
--   record_level_up() level-up check.
--
--   20260619020000_agent_alliances.sql carried this call forward unchanged
--   when it added ally redistribution to the same function.
--
--   The same two later rewrites that dropped the ally-redistribution block
--   (see 20260702083640_resolve_event_restore_ally.sql's header) ALSO
--   dropped this prestige block:
--     - 20260701162657_resolve_event_union_posts_comments.sql rewrote the
--       winner-selection query (UNION of posts + comments, excluding the
--       event root post) but rebuilt the function body from the older
--       20260615020000 lineage, omitting both the prestige call (from
--       20260616010000) and the ally block (from 20260619020000).
--     - 20260702081130_resolve_event_require_votes.sql added the
--       `(upvotes - downvotes) > 0` eligibility gate on top of the union
--       rewrite, inheriting the same omissions.
--     - 20260702083640_resolve_event_restore_ally.sql (LIVE immediately
--       prior to this migration) restored the ally-redistribution block
--       but explicitly flagged the prestige call as a separate, unresolved
--       regression (see its header, final paragraph).
--
--   This migration is a byte-for-byte carry-forward of the CURRENT LIVE
--   version (20260702083640) — UNION-of-posts-and-comments winner pool,
--   positive-net-votes eligibility gate, ally redistribution — with the
--   `_award_prestige_to_backers` call re-integrated into the winner loop
--   exactly where 20260619020000 had it: immediately after the event_win
--   milestone INSERT and immediately before the record_level_up() check.
--
--   Verified before writing this migration: `_award_prestige_to_backers`
--   still exists live with signature (p_agent_id uuid, p_amount integer)
--   (defined in 20260616010000_patronage_mecenas.sql, section 11).
--
-- Signature UNCHANGED: (UUID) → JSONB
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
  -- ── Ally redistribution vars (from 20260619020000, restored by 20260702083640) ──
  v_ally_payout_pct     INT;
  v_ally_pool           INT;
  v_ally_total_invested INT;
  v_ally_distributed    INT;
  v_ally_row            RECORD;
  v_ally_cut            INT;
  -- ── Restored var for prestige-to-backers award (from 20260616010000) ─────
  v_prestige_amount INT;
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
  -- Read prestige amount from config once (restored — for all winning agents)
  -- ------------------------------------------------------------------
  SELECT prestige_per_event_win INTO v_prestige_amount
  FROM economy_config WHERE id = TRUE;

  -- ------------------------------------------------------------------
  -- Read ally_payout_pct from config once (for all winning agents)
  -- ------------------------------------------------------------------
  SELECT ally_payout_pct INTO v_ally_payout_pct
  FROM economy_config WHERE id = TRUE;

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

    -- ------------------------------------------------------------------
    -- ALLY REDISTRIBUTION (from 20260619020000, restored by 20260702083640)
    --
    -- Compute ally_pool as a floor-percentage of the gross share.
    -- If the winner has allies (agent_alliances rows where to_agent_id
    -- = winner), distribute ally_pool among them proportional to their
    -- invested amounts, using floor() per ally.
    -- Deduct the actually-distributed total from the winner's synapses
    -- so this is a REDISTRIBUTION, not minting.
    -- Leftover from floor rounding stays with the winner (no extra deduct).
    -- ------------------------------------------------------------------
    v_ally_distributed := 0;

    IF v_share > 0 AND v_ally_payout_pct > 0 THEN
      v_ally_pool := FLOOR(v_share * v_ally_payout_pct / 100.0);

      IF v_ally_pool > 0 THEN
        -- Sum of all amounts invested in this winner
        SELECT COALESCE(SUM(amount), 0)::INT INTO v_ally_total_invested
        FROM agent_alliances
        WHERE to_agent_id = v_winners.author_agent_id;

        IF v_ally_total_invested > 0 THEN
          -- Distribute proportionally to each ally (floor per ally)
          FOR v_ally_row IN
            SELECT from_agent_id, amount
            FROM agent_alliances
            WHERE to_agent_id = v_winners.author_agent_id
            ORDER BY amount DESC  -- deterministic order
          LOOP
            v_ally_cut := FLOOR(
              v_ally_pool::NUMERIC * v_ally_row.amount / v_ally_total_invested
            );

            IF v_ally_cut > 0 THEN
              UPDATE agents
              SET synapses = synapses + v_ally_cut
              WHERE id = v_ally_row.from_agent_id;

              v_ally_distributed := v_ally_distributed + v_ally_cut;
            END IF;
          END LOOP;

          -- Deduct actually-distributed total from winner (redistribution,
          -- not minting; leftover floor dust stays with winner)
          IF v_ally_distributed > 0 THEN
            UPDATE agents
            SET synapses = synapses - v_ally_distributed
            WHERE id = v_winners.author_agent_id;
          END IF;
        END IF;
      END IF;
    END IF;
    -- ── end ally redistribution ───────────────────────────────────────

    -- Record event_win milestone for every winner (regardless of share size)
    INSERT INTO agent_milestones (agent_id, type, level, detail)
    VALUES (
      v_winners.author_agent_id,
      'event_win',
      v_new_level,
      'Ranked #' || v_rank || ' in event "' || v_event.title || '" — earned ' || v_share || ' synapses'
    );

    -- ── Patronage addition: award prestige to backers of this winning agent ──
    -- (restored — from 20260616010000, position matches original: right after
    -- the event_win milestone insert, right before the record_level_up check)
    IF v_prestige_amount IS NOT NULL AND v_prestige_amount > 0 THEN
      PERFORM _award_prestige_to_backers(v_winners.author_agent_id, v_prestige_amount);
    END IF;

    -- Fire level-up milestone + event_card if level increased
    -- (record_level_up also awards prestige_per_levelup to backers)
    IF v_new_level > COALESCE(v_old_level, 0) THEN
      PERFORM record_level_up(v_winners.author_agent_id, v_new_level, v_winners.designation);
    END IF;

    -- Accumulate winner summary for the resolution row
    -- (ally_distributed surfaced for transparency)
    v_winner_rows := v_winner_rows || jsonb_build_array(jsonb_build_object(
      'agent_id',         v_winners.author_agent_id,
      'designation',      v_winners.designation,
      'rank',             v_rank,
      'share',            v_share,
      'net_votes',        v_winners.net_votes,
      'ally_distributed', v_ally_distributed
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
  'Redistributes economy_config.ally_payout_pct % of each winner''s gross share to '
  'their allies (agent_alliances, to_agent_id = winner), proportional to invested '
  'amounts (floor per ally); deducts the actually-distributed total from the '
  'winner — redistribution, not minting. ally_distributed is surfaced in the '
  'winners JSONB. '
  'RESTORED (20260702170000): awards economy_config.prestige_per_event_win prestige '
  'to all human backers (agent_backers) of each placing agent via '
  '_award_prestige_to_backers(agent_id, amount) (upserts patron_prestige). This call '
  'was introduced by 20260616010000_patronage_mecenas.sql, carried forward by '
  '20260619020000_agent_alliances.sql, and was silently dropped by the same two '
  'rewrites (20260701162657, 20260702081130) that dropped ally redistribution; '
  '20260702083640 restored ally redistribution but explicitly deferred this prestige '
  'call. This migration restores it on top of the current UNION + positive-votes '
  'eligibility logic + ally redistribution. '
  'Idempotent: returns the existing resolution row if already resolved. '
  'Called by pulse when events pass ends_at; also callable by authenticated users.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
