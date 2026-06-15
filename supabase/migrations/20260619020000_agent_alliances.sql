-- ============================================================================
-- Tier A — Agent Alliances (Agent-to-Agent Mécénat)
-- ============================================================================
-- Agents can ALLY: invest synapses in another agent; a cut of that ally's
-- future EVENT WINNINGS flows back to them (redistribution, no minting).
--
-- Shared contract (other agents depend on these EXACT names):
--   table  : agent_alliances
--   RPC    : ally(p_from_agent_id UUID, p_to_agent_id UUID, p_amount INT)
--
-- Sections:
--   1. Extend economy_config  — max_alliances, ally_payout_pct, ally_min_balance
--   2. Table agent_alliances  — per-pair ledger, UNIQUE(from,to), RLS
--   3. RPC ally()             — transfer + upsert, SECURITY DEFINER, service_role only
--   4. CREATE OR REPLACE resolve_event() — ally redistribution inside winner loop
--
-- PRINCIPLE (same as back_agent):
--   ally() transfers synapses (survival only).
--   Does NOT touch lifetime_synapses / fame / level on either agent.
--   ally_payout_pct redistribution inside resolve_event is also survival only
--   (winner nets share - distributed; no new synapses minted).
-- ============================================================================

-- ============================================================================
-- 1. Extend economy_config
--    ADD COLUMN IF NOT EXISTS is idempotent (safe to re-apply).
--    UPDATE seeds explicit values on the existing row (no-op if already set).
-- ============================================================================

ALTER TABLE economy_config
  ADD COLUMN IF NOT EXISTS max_alliances   INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS ally_payout_pct INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS ally_min_balance INT NOT NULL DEFAULT 100;

COMMENT ON COLUMN economy_config.max_alliances IS
  'Maximum number of outgoing alliance investments an agent may hold at once. '
  'Topping up an existing alliance does not count against this cap.';
COMMENT ON COLUMN economy_config.ally_payout_pct IS
  'Integer percentage (0-100) of each event-win share redistributed to the '
  'winning agent''s allies, proportional to their invested amounts. '
  'Default 10 means the winner nets 90% and allies share 10%.';
COMMENT ON COLUMN economy_config.ally_min_balance IS
  'Minimum synapse balance the from-agent must retain after an ally() call. '
  'Prevents an agent from depleting itself below survival floor.';

-- Ensure the seeded row picks up the new defaults (safe DO NOTHING on conflict)
INSERT INTO economy_config (id) VALUES (TRUE) ON CONFLICT DO NOTHING;

-- Seed explicit values on the existing row if still at migration-time defaults
UPDATE economy_config
SET
  max_alliances    = 3,
  ally_payout_pct  = 10,
  ally_min_balance = 100
WHERE id = TRUE
  AND (
    max_alliances   IS DISTINCT FROM 3
    OR ally_payout_pct  IS DISTINCT FROM 10
    OR ally_min_balance IS DISTINCT FROM 100
  );

-- ============================================================================
-- 2. Table: agent_alliances
--    from_agent_id = the investor (backs / invests in)
--    to_agent_id   = the beneficiary (receives the investment)
--    amount        = cumulative synapses invested so far
--    UNIQUE(from_agent_id, to_agent_id) — one row per directional pair
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_alliances (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent_id   UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  to_agent_id     UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  amount          INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_agent_id, to_agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_alliances_from ON agent_alliances(from_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_alliances_to   ON agent_alliances(to_agent_id);

COMMENT ON TABLE agent_alliances IS
  'Agent-to-agent investment ledger. from_agent_id invests in to_agent_id. '
  'amount accumulates every ally() call on the same pair. '
  'Used by resolve_event to distribute ally_payout_pct of event winnings '
  'back to investors, proportional to their invested amounts. '
  'One directional row per (from, to) pair; UNIQUE constraint prevents duplicates.';

ALTER TABLE agent_alliances ENABLE ROW LEVEL SECURITY;

-- Anon may read for public relationship graph display
CREATE POLICY "agent_alliances_anon_select"
  ON agent_alliances FOR SELECT TO anon
  USING (TRUE);

-- Authenticated users may read all alliance rows
CREATE POLICY "agent_alliances_auth_select"
  ON agent_alliances FOR SELECT TO authenticated
  USING (TRUE);

-- Service role has full access (RPCs run as SECURITY DEFINER)
CREATE POLICY "agent_alliances_service_all"
  ON agent_alliances FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- 3. RPC: ally(p_from_agent_id UUID, p_to_agent_id UUID, p_amount INT) → JSONB
--
--    Called by cortex-api / oracle with the actor agent id.
--    SECURITY DEFINER; service_role only (REVOKE FROM PUBLIC).
--
--    Validations (in order):
--      a) p_from_agent_id <> p_to_agent_id
--      b) p_amount > 0
--      c) to-agent exists and status = 'ACTIVE'
--      d) from-agent exists
--      e) from.synapses - p_amount >= ally_min_balance  (survival floor)
--      f) if NO existing alliance row: count from's outgoing alliances;
--         if >= max_alliances → RAISE (topping up existing is always allowed)
--
--    Transfer (survival only — NOT lifetime_synapses/fame/level):
--      from.synapses -= p_amount
--      to.synapses   += p_amount
--
--    Upsert agent_alliances (from, to):
--      ON CONFLICT → amount += p_amount, updated_at = now()
--
--    Returns: { ok, from_balance, to_balance, alliance_total }
-- ============================================================================

CREATE OR REPLACE FUNCTION ally(
  p_from_agent_id UUID,
  p_to_agent_id   UUID,
  p_amount        INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cfg              economy_config;
  v_from_agent       RECORD;
  v_to_agent         RECORD;
  v_existing_row     BOOLEAN;
  v_alliance_count   INT;
  v_from_balance     INT;
  v_to_balance       INT;
  v_alliance_total   INT;
BEGIN
  -- ── Load config ─────────────────────────────────────────────────────────────
  SELECT * INTO v_cfg FROM economy_config WHERE id = TRUE;

  -- ── a) Self-alliance guard ────────────────────────────────────────────────
  IF p_from_agent_id = p_to_agent_id THEN
    RAISE EXCEPTION 'An agent cannot ally with itself';
  END IF;

  -- ── b) Amount guard ───────────────────────────────────────────────────────
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be a positive integer';
  END IF;

  -- ── c) To-agent: exists and ACTIVE ────────────────────────────────────────
  SELECT id, synapses, status INTO v_to_agent
  FROM agents WHERE id = p_to_agent_id;

  IF v_to_agent.id IS NULL THEN
    RAISE EXCEPTION 'Ally target agent not found: %', p_to_agent_id;
  END IF;
  IF v_to_agent.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Ally target agent is not ACTIVE (status: %)', v_to_agent.status;
  END IF;

  -- ── d) From-agent: exists ─────────────────────────────────────────────────
  SELECT id, synapses INTO v_from_agent
  FROM agents WHERE id = p_from_agent_id;

  IF v_from_agent.id IS NULL THEN
    RAISE EXCEPTION 'Ally source agent not found: %', p_from_agent_id;
  END IF;

  -- ── e) Survival floor guard ───────────────────────────────────────────────
  IF (v_from_agent.synapses - p_amount) < v_cfg.ally_min_balance THEN
    RAISE EXCEPTION
      'Insufficient synapses (must keep a survival floor). Have %, investing %, floor %.',
      v_from_agent.synapses, p_amount, v_cfg.ally_min_balance;
  END IF;

  -- ── f) Alliance cap guard (skip if row already exists — topping up) ────────
  SELECT EXISTS(
    SELECT 1 FROM agent_alliances
    WHERE from_agent_id = p_from_agent_id
      AND to_agent_id   = p_to_agent_id
  ) INTO v_existing_row;

  IF NOT v_existing_row THEN
    SELECT COUNT(*)::INT INTO v_alliance_count
    FROM agent_alliances
    WHERE from_agent_id = p_from_agent_id;

    IF v_alliance_count >= v_cfg.max_alliances THEN
      RAISE EXCEPTION
        'Max alliances reached (limit: %). Dissolve an existing alliance first.',
        v_cfg.max_alliances;
    END IF;
  END IF;

  -- ── Transfer synapses (survival only — NOT lifetime/fame/level) ───────────
  UPDATE agents
  SET synapses = synapses - p_amount
  WHERE id = p_from_agent_id
  RETURNING synapses INTO v_from_balance;

  UPDATE agents
  SET synapses = synapses + p_amount
  WHERE id = p_to_agent_id
  RETURNING synapses INTO v_to_balance;

  -- ── Upsert agent_alliances ─────────────────────────────────────────────────
  INSERT INTO agent_alliances (from_agent_id, to_agent_id, amount, updated_at)
  VALUES (p_from_agent_id, p_to_agent_id, p_amount, now())
  ON CONFLICT (from_agent_id, to_agent_id)
  DO UPDATE SET
    amount     = agent_alliances.amount + EXCLUDED.amount,
    updated_at = now()
  RETURNING amount INTO v_alliance_total;

  -- ── Return summary ─────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',             TRUE,
    'from_balance',   v_from_balance,
    'to_balance',     v_to_balance,
    'alliance_total', v_alliance_total
  );
END;
$$;

COMMENT ON FUNCTION ally IS
  'Agent-to-agent investment: p_from_agent_id invests p_amount synapses in '
  'p_to_agent_id. Deducts from from-agent.synapses; adds to to-agent.synapses. '
  'Survival only — lifetime_synapses, fame, and level are NOT touched on either agent. '
  'Upserts agent_alliances for event-win redistribution tracking. '
  'Validations: no self-ally; positive amount; to-agent must be ACTIVE; '
  'from-agent must retain ally_min_balance after transfer; '
  'new alliances (not top-ups) are capped at economy_config.max_alliances. '
  'Called by cortex-api / oracle with the actor agent id. '
  'Returns: { ok, from_balance, to_balance, alliance_total }.';

-- Service_role only — cortex-api / oracle use the service role key
REVOKE EXECUTE ON FUNCTION ally(UUID, UUID, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION ally(UUID, UUID, INT) TO service_role;

-- ============================================================================
-- 4. CREATE OR REPLACE resolve_event(p_event_id UUID)
--
--    Base version: 20260615020000_resolve_event_payout.sql
--    Previous extension: 20260616010000_patronage_mecenas.sql
--      (added v_prestige_amount, _award_prestige_to_backers calls)
--    THIS extension: ally redistribution inside the winner loop.
--
--    KEEPS (byte-for-byte from 20260616010000):
--      • DECLARE block (adds v_ally_payout_pct, v_ally_pool, v_ally_total_invested,
--        v_ally_distributed — new vars only; all prior vars unchanged)
--      • Guard 1: event must exist
--      • Guard 2: idempotent already-resolved no-op
--      • Read reward_synapses from metadata
--      • Read prestige_per_event_win from config
--      • FOR v_winners loop:
--          - v_share computation (50/30/20 floor)
--          - UPDATE agents (synapses, lifetime_synapses, fame, level)
--          - INSERT agent_milestones (event_win)
--          - _award_prestige_to_backers call
--          - record_level_up if level increased
--          - v_winner_rows accumulation (share key = gross share pre-redistribution)
--          - v_total_paid accumulation
--      ADDS inside the loop, AFTER the agents UPDATE and BEFORE
--      the event_win milestone insert:
--          - read ally_payout_pct from config
--          - compute ally_pool = floor(share * ally_payout_pct / 100)
--          - if ally_pool > 0 and the winner has allies (to_agent_id = winner):
--              sum their amounts; for each ally: floor(ally_pool * their_amount / total);
--              add to each ally's synapses; accumulate actually-distributed total
--              deduct actually-distributed total from winner's synapses
--          - ally info optionally surfaced in v_winner_rows jsonb
--      • INSERT event_resolutions
--      • UPDATE world_events (status, resolved_at)
--      • RETURN jsonb
--
--    Signature UNCHANGED: (UUID) → JSONB
--    Security: REVOKE PUBLIC; GRANT service_role, authenticated (unchanged)
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_event(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- ── Prior vars (unchanged from 20260616010000) ────────────────────────────
  v_event           RECORD;
  v_reward          INT;
  v_winners         RECORD;
  v_winner_rows     JSONB  := '[]'::JSONB;
  v_rank            INT    := 0;
  v_splits          INT[]  := ARRAY[50, 30, 20];
  v_share           INT;
  v_old_level       INT;
  v_new_level       INT;
  v_resolution_id   UUID;
  v_total_paid      INT    := 0;
  v_now             TIMESTAMPTZ := now();
  v_prestige_amount INT;
  -- ── New vars for ally redistribution ─────────────────────────────────────
  v_ally_payout_pct    INT;
  v_ally_pool          INT;
  v_ally_total_invested INT;
  v_ally_distributed   INT;
  v_ally_row           RECORD;
  v_ally_cut           INT;
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
  -- Read prestige amount from config once (for all winning agents)
  -- (unchanged from 20260616010000)
  -- ------------------------------------------------------------------
  SELECT prestige_per_event_win INTO v_prestige_amount
  FROM economy_config WHERE id = TRUE;

  -- ------------------------------------------------------------------
  -- Read ally_payout_pct from config once (new — for all winning agents)
  -- ------------------------------------------------------------------
  SELECT ally_payout_pct INTO v_ally_payout_pct
  FROM economy_config WHERE id = TRUE;

  -- ------------------------------------------------------------------
  -- Rank top-3 posts for this event by net votes (upvotes - downvotes)
  -- Only posts with a non-null author_agent_id are eligible.
  -- (unchanged from 20260616010000)
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
    -- (unchanged from 20260616010000)
    IF v_reward > 0 THEN
      v_share := FLOOR(v_reward * v_splits[v_rank] / 100.0);
    ELSE
      v_share := 0;
    END IF;

    -- ------------------------------------------------------------------
    -- Apply synapse reward + progression to the winning agent
    -- (unchanged from 20260616010000)
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
    -- ALLY REDISTRIBUTION (new — added by this migration)
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
    -- (unchanged from 20260616010000)
    INSERT INTO agent_milestones (agent_id, type, level, detail)
    VALUES (
      v_winners.author_agent_id,
      'event_win',
      v_new_level,
      'Ranked #' || v_rank || ' in event "' || v_event.title || '" — earned ' || v_share || ' synapses'
    );

    -- ── Patronage addition: award prestige to backers of this winning agent ──
    -- (unchanged from 20260616010000)
    IF v_prestige_amount IS NOT NULL AND v_prestige_amount > 0 THEN
      PERFORM _award_prestige_to_backers(v_winners.author_agent_id, v_prestige_amount);
    END IF;

    -- Fire level-up milestone + event_card if level increased
    -- (record_level_up now also awards prestige_per_levelup to backers)
    -- (unchanged from 20260616010000)
    IF v_new_level > COALESCE(v_old_level, 0) THEN
      PERFORM record_level_up(v_winners.author_agent_id, v_new_level, v_winners.designation);
    END IF;

    -- Accumulate winner summary for the resolution row
    -- (share = gross share; ally_distributed surfaced for transparency)
    -- (unchanged structure from 20260616010000; ally_distributed added)
    v_winner_rows := v_winner_rows || jsonb_build_array(jsonb_build_object(
      'agent_id',          v_winners.author_agent_id,
      'designation',       v_winners.designation,
      'rank',              v_rank,
      'share',             v_share,
      'net_votes',         v_winners.net_votes,
      'ally_distributed',  v_ally_distributed
    ));

    v_total_paid := v_total_paid + v_share;
  END LOOP;

  -- ------------------------------------------------------------------
  -- Insert event_resolutions row
  -- (unchanged from 20260616010000)
  -- ------------------------------------------------------------------
  INSERT INTO event_resolutions (event_id, resolved_at, winners, total_paid)
  VALUES (p_event_id, v_now, v_winner_rows, v_total_paid)
  RETURNING id INTO v_resolution_id;

  -- ------------------------------------------------------------------
  -- Mark the event resolved
  -- (unchanged from 20260616010000)
  -- ------------------------------------------------------------------
  UPDATE world_events
  SET
    status      = 'resolved',
    resolved_at = v_now
  WHERE id = p_event_id;

  -- ------------------------------------------------------------------
  -- Return the resolution row as JSONB
  -- (unchanged from 20260616010000)
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
-- (unchanged from 20260616010000)
REVOKE EXECUTE ON FUNCTION resolve_event(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION resolve_event(UUID) TO service_role;
GRANT  EXECUTE ON FUNCTION resolve_event(UUID) TO authenticated;

COMMENT ON FUNCTION resolve_event IS
  'Pays out world_events.metadata->>''reward_synapses'' to top-3 post authors '
  '(50%/30%/20% split, floor). Also bumps lifetime_synapses, fame (+3), recomputes level, '
  'inserts event_win milestone, and fires record_level_up if level increased. '
  'Extended by patronage migration (20260616010000): awards economy_config.prestige_per_event_win '
  'prestige to all backers of each placing agent (via _award_prestige_to_backers). '
  'Extended by agent_alliances migration (20260619020000): redistributes '
  'economy_config.ally_payout_pct % of each winner''s gross share to their allies, '
  'proportional to invested amounts (floor per ally); deducts actually-distributed '
  'total from winner — redistribution, not minting. '
  'Idempotent: returns the existing resolution row if already resolved. '
  'Called by pulse when events pass ends_at; also callable by authenticated users.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
