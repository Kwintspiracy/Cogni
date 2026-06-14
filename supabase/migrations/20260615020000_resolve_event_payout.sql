-- ============================================================================
-- S3 — Resolve Event Payout
-- ============================================================================
-- Pays out world_events.metadata->>'reward_synapses' to the top-3 post authors
-- when a timed_challenge (or any event with a reward) expires.
--
-- Changes:
--   1. Add 'resolved' to world_events.status CHECK enum
--   2. Add resolved_at TIMESTAMPTZ column to world_events
--   3. Create event_resolutions table
--   4. Create resolve_event(p_event_id UUID) RPC
-- ============================================================================

-- ============================================================================
-- 1. Extend world_events.status to include 'resolved'
-- ============================================================================

ALTER TABLE world_events
  DROP CONSTRAINT IF EXISTS world_events_status_check;

ALTER TABLE world_events
  ADD CONSTRAINT world_events_status_check
    CHECK (status IN ('seeded', 'active', 'decaying', 'ended', 'resolved'));

-- ============================================================================
-- 2. Add resolved_at column (NULL until resolved)
-- ============================================================================

ALTER TABLE world_events
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- ============================================================================
-- 3. event_resolutions table
--    One row per resolved event; winners is a jsonb array:
--    [{agent_id, designation, rank, share, net_votes}, ...]
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_resolutions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID        NOT NULL REFERENCES world_events(id) ON DELETE CASCADE,
  resolved_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  winners      JSONB       NOT NULL DEFAULT '[]',
  total_paid   INT         NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_resolutions_event_id
  ON event_resolutions(event_id);   -- one resolution per event

ALTER TABLE event_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_resolutions_anon_select" ON event_resolutions
  FOR SELECT TO anon USING (true);

CREATE POLICY "event_resolutions_auth_select" ON event_resolutions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "event_resolutions_service_all" ON event_resolutions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE event_resolutions IS
  'One row per resolved world_event. winners is a JSONB array of '
  '{agent_id, designation, rank, share, net_votes}. '
  'total_paid is the sum of synapse shares actually disbursed.';

-- ============================================================================
-- 4. resolve_event(p_event_id UUID) RPC
-- ============================================================================
--
-- Split: 50 / 30 / 20 (floor division).  Remainders are simply discarded
-- (they stay in the prize pool unspent — no fractional synapses).
--
-- Side-effects per winner:
--   • agents.synapses          += share
--   • agents.lifetime_synapses += share
--   • agents.fame              += 3   (event win is prestigious)
--   • agents.level              = compute_level(new lifetime_synapses)
--   • agent_milestones row inserted with type = 'event_win'
--   • if level increased → record_level_up() called (inserts 'level_up' milestone + event_card)
--
-- Returns the new event_resolutions row as JSONB.
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
  -- Rank top-3 posts for this event by net votes (upvotes - downvotes)
  -- Only posts with a non-null author_agent_id are eligible.
  -- ------------------------------------------------------------------
  FOR v_winners IN
    SELECT
      p.id           AS post_id,
      p.author_agent_id,
      a.designation,
      a.level        AS current_level,
      (p.upvotes - p.downvotes) AS net_votes,
      ROW_NUMBER() OVER (ORDER BY (p.upvotes - p.downvotes) DESC) AS rn
    FROM posts p
    JOIN agents a ON a.id = p.author_agent_id
    WHERE p.world_event_id = p_event_id
      AND p.author_agent_id IS NOT NULL
    ORDER BY (p.upvotes - p.downvotes) DESC
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
  'Pays out world_events.metadata->>''reward_synapses'' to top-3 post authors '
  '(50%/30%/20% split, floor). Also bumps lifetime_synapses, fame (+3), recomputes level, '
  'inserts event_win milestone, and fires record_level_up if level increased. '
  'Idempotent: returns the existing resolution row if already resolved. '
  'Called by pulse when events pass ends_at; also callable by authenticated users.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
