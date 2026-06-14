-- ============================================================================
-- Tier S / S2 — Patronage (Mécénat) System
-- ============================================================================
-- • Extend economy_config with influence/prestige tunables
-- • Tables: user_influence, agent_backers, patron_prestige
-- • RPCs: get_my_influence(), back_agent(), get_agent_backers(), get_patron_leaderboard()
-- • Prestige hooks: CREATE OR REPLACE record_level_up(), resolve_event()
--
-- PRINCIPLE: Backing adds synapses (survival) only.
-- Prestige accrues to patrons separately when their backed agents naturally
-- level up or win events. Backing does NOT touch lifetime_synapses, fame, or level.
-- ============================================================================

-- ============================================================================
-- 0. pgcrypto guard (already enabled; this is a no-op on production)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. Extend economy_config with patronage columns
-- ============================================================================

ALTER TABLE economy_config
  ADD COLUMN IF NOT EXISTS daily_influence_grant    INT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS influence_balance_cap    INT NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS prestige_per_levelup     INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS prestige_per_event_win   INT NOT NULL DEFAULT 10;

COMMENT ON COLUMN economy_config.daily_influence_grant  IS
  'Influence points granted to a user each calendar day (top-up, not cumulative stack).';
COMMENT ON COLUMN economy_config.influence_balance_cap  IS
  'Maximum influence a user can hold at once. Daily top-up will not exceed this cap.';
COMMENT ON COLUMN economy_config.prestige_per_levelup   IS
  'Prestige points awarded to ALL backers of an agent when that agent naturally levels up.';
COMMENT ON COLUMN economy_config.prestige_per_event_win IS
  'Prestige points awarded to ALL backers of an agent when that agent wins (places) in an event.';

-- Ensure the seeded row picks up the new defaults (safe DO NOTHING on conflict)
INSERT INTO economy_config (id) VALUES (TRUE) ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. user_influence — daily allowance wallet
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_influence (
  user_id         UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  points          INT     NOT NULL DEFAULT 0,
  last_grant_date DATE,
  lifetime_granted BIGINT NOT NULL DEFAULT 0
);

COMMENT ON TABLE user_influence IS
  'Per-user influence balance. Points are topped up daily (not stacked) up to '
  'economy_config.influence_balance_cap. Spending converts 1 influence → 1 synapse '
  'on an agent. Does NOT affect agent lifetime_synapses/fame/level.';

ALTER TABLE user_influence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_influence_self_select"
  ON user_influence FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_influence_service_all"
  ON user_influence FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- 3. agent_backers — cumulative backer ledger (one row per user/agent pair)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_backers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id     UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  total_amount INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_backers_agent ON agent_backers(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_backers_user  ON agent_backers(user_id);

COMMENT ON TABLE agent_backers IS
  'Cumulative backer ledger: one row per (user, agent) pair. total_amount accumulates '
  'every time the user backs the same agent. Used for backer lists and prestige hooks.';

ALTER TABLE agent_backers ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all backer records (backer lists are public-ish)
CREATE POLICY "agent_backers_auth_select"
  ON agent_backers FOR SELECT TO authenticated
  USING (TRUE);

-- Anon may also read for public aggregate display
CREATE POLICY "agent_backers_anon_select"
  ON agent_backers FOR SELECT TO anon
  USING (TRUE);

-- Service role gets full access (RPCs run as SECURITY DEFINER)
CREATE POLICY "agent_backers_service_all"
  ON agent_backers FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- 4. patron_prestige — prestige leaderboard wallet
-- ============================================================================

CREATE TABLE IF NOT EXISTS patron_prestige (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prestige   INT         NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE patron_prestige IS
  'Per-user prestige score. Increases when a backed agent naturally levels up '
  'or wins an event. Purely cosmetic / bragging-rights metric.';

ALTER TABLE patron_prestige ENABLE ROW LEVEL SECURITY;

-- Users can see their own prestige
CREATE POLICY "patron_prestige_self_select"
  ON patron_prestige FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Everyone can read for the leaderboard
CREATE POLICY "patron_prestige_anon_select"
  ON patron_prestige FOR SELECT TO anon
  USING (TRUE);

CREATE POLICY "patron_prestige_auth_read_all"
  ON patron_prestige FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "patron_prestige_service_all"
  ON patron_prestige FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- 5. Private helper: _apply_daily_influence_grant(p_user_id UUID)
--    Upserts a user_influence row and tops up points if last_grant_date < today.
--    Returns the row after any grant has been applied.
--    NOT exposed to clients — called only by other SECURITY DEFINER functions.
-- ============================================================================

CREATE OR REPLACE FUNCTION _apply_daily_influence_grant(p_user_id UUID)
RETURNS user_influence
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cfg  economy_config;
  v_row  user_influence;
BEGIN
  SELECT * INTO v_cfg FROM economy_config WHERE id = TRUE;

  -- Upsert the row (creates it with 0 points if first time)
  INSERT INTO user_influence (user_id, points, last_grant_date, lifetime_granted)
  VALUES (p_user_id, 0, NULL, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Fetch current state
  SELECT * INTO v_row FROM user_influence WHERE user_id = p_user_id;

  -- Top up if today's grant hasn't been applied yet
  IF v_row.last_grant_date IS DISTINCT FROM current_date THEN
    UPDATE user_influence
    SET
      points          = LEAST(points + v_cfg.daily_influence_grant, v_cfg.influence_balance_cap),
      last_grant_date = current_date,
      lifetime_granted = lifetime_granted + v_cfg.daily_influence_grant
    WHERE user_id = p_user_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

-- Internal only — not exposed to any role directly
REVOKE EXECUTE ON FUNCTION _apply_daily_influence_grant(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION _apply_daily_influence_grant(UUID) TO service_role;

-- ============================================================================
-- 6. RPC: get_my_influence() → JSONB { points, last_grant_date, cap }
--    Identity derived from auth.uid() — never trust client-passed user_id.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_my_influence()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid  UUID;
  v_row  user_influence;
  v_cfg  economy_config;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Apply today's grant (idempotent if already applied)
  v_row := _apply_daily_influence_grant(v_uid);

  SELECT * INTO v_cfg FROM economy_config WHERE id = TRUE;

  RETURN jsonb_build_object(
    'points',          v_row.points,
    'last_grant_date', v_row.last_grant_date,
    'cap',             v_cfg.influence_balance_cap
  );
END;
$$;

COMMENT ON FUNCTION get_my_influence IS
  'Returns the caller''s influence balance. Auto-applies today''s daily grant if not yet '
  'credited. Identity from auth.uid() — no client-passed user_id. '
  'Returns: {points, last_grant_date, cap}.';

REVOKE EXECUTE ON FUNCTION get_my_influence() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_my_influence() TO authenticated;
GRANT  EXECUTE ON FUNCTION get_my_influence() TO service_role;

-- ============================================================================
-- 7. RPC: back_agent(p_agent_id UUID, p_amount INT) → JSONB
--    Deducts influence from caller, adds same amount to agent.synapses ONLY.
--    Does NOT touch lifetime_synapses / fame / level (those are pay-to-win).
-- ============================================================================

CREATE OR REPLACE FUNCTION back_agent(
  p_agent_id UUID,
  p_amount   INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid              UUID;
  v_row              user_influence;
  v_agent_synapses   INT;
  v_agent_exists     BOOLEAN;
BEGIN
  -- ── Identity ──────────────────────────────────────────────────────────────
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- ── Validate amount ───────────────────────────────────────────────────────
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be a positive integer';
  END IF;

  -- ── Validate agent exists ─────────────────────────────────────────────────
  SELECT EXISTS(SELECT 1 FROM agents WHERE id = p_agent_id) INTO v_agent_exists;
  IF NOT v_agent_exists THEN
    RAISE EXCEPTION 'Agent not found: %', p_agent_id;
  END IF;

  -- ── Apply today's daily grant, then read current balance ──────────────────
  v_row := _apply_daily_influence_grant(v_uid);

  IF v_row.points < p_amount THEN
    RAISE EXCEPTION 'Insufficient influence (have %, need %)', v_row.points, p_amount;
  END IF;

  -- ── Deduct influence ──────────────────────────────────────────────────────
  UPDATE user_influence
  SET points = points - p_amount
  WHERE user_id = v_uid
  RETURNING * INTO v_row;

  -- ── Credit synapses (survival only — NOT lifetime/fame/level) ─────────────
  UPDATE agents
  SET synapses = synapses + p_amount
  WHERE id = p_agent_id
  RETURNING synapses INTO v_agent_synapses;

  -- ── Upsert agent_backers (cumulative) ────────────────────────────────────
  INSERT INTO agent_backers (user_id, agent_id, total_amount, updated_at)
  VALUES (v_uid, p_agent_id, p_amount, now())
  ON CONFLICT (user_id, agent_id)
  DO UPDATE SET
    total_amount = agent_backers.total_amount + EXCLUDED.total_amount,
    updated_at   = now();

  -- ── Ensure patron_prestige row exists for this user ───────────────────────
  INSERT INTO patron_prestige (user_id, prestige, updated_at)
  VALUES (v_uid, 0, now())
  ON CONFLICT (user_id) DO NOTHING;

  -- ── Return summary ────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',             TRUE,
    'new_balance',    v_row.points,
    'agent_synapses', v_agent_synapses
  );
END;
$$;

COMMENT ON FUNCTION back_agent IS
  'Patron spends influence to add synapses to an agent (1 influence = 1 synapse). '
  'Deducts from user_influence.points; adds to agents.synapses ONLY — '
  'lifetime_synapses, fame, and level are intentionally NOT touched (no pay-to-win). '
  'Upserts agent_backers for prestige tracking. Identity from auth.uid().';

REVOKE EXECUTE ON FUNCTION back_agent(UUID, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION back_agent(UUID, INT) TO authenticated;
GRANT  EXECUTE ON FUNCTION back_agent(UUID, INT) TO service_role;

-- ============================================================================
-- 8. Privacy helper: _mask_handle(p_user_id UUID) → TEXT
--    Produces a deterministic, one-way pseudonym: 'Patron-' || first 4 hex chars
--    of SHA-256(user_id::text). Never exposes email or raw UUID.
-- ============================================================================

CREATE OR REPLACE FUNCTION _mask_handle(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
AS $$
  -- md5() is a core built-in (no pgcrypto/schema dependency, unlike digest()
  -- which lives in the `extensions` schema and isn't on the migration search_path).
  SELECT 'Patron-' || LEFT(md5(p_user_id::TEXT), 4);
$$;

REVOKE EXECUTE ON FUNCTION _mask_handle(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION _mask_handle(UUID) TO service_role;

-- ============================================================================
-- 9. RPC: get_agent_backers(p_agent_id UUID) → JSONB
--    Public summary of who backs an agent. Handles are privacy-masked.
--    STABLE — safe to cache; no writes.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_agent_backers(p_agent_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_backer_count INT;
  v_total_backed INT;
  v_top_backers  JSONB;
BEGIN
  SELECT
    COUNT(*)::INT,
    COALESCE(SUM(total_amount), 0)::INT
  INTO v_backer_count, v_total_backed
  FROM agent_backers
  WHERE agent_id = p_agent_id;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.amount DESC), '[]'::JSONB)
  INTO v_top_backers
  FROM (
    SELECT
      _mask_handle(user_id) AS handle,
      total_amount          AS amount
    FROM agent_backers
    WHERE agent_id = p_agent_id
    ORDER BY total_amount DESC
    LIMIT 5
  ) t;

  RETURN jsonb_build_object(
    'backer_count', v_backer_count,
    'total_backed', v_total_backed,
    'top_backers',  v_top_backers
  );
END;
$$;

COMMENT ON FUNCTION get_agent_backers IS
  'Returns backer stats for an agent: backer_count, total_backed, top 5 backers '
  'by amount. Handles are privacy-masked (Patron-XXXX). '
  'STABLE — no side effects. Accessible to authenticated users and anon.';

REVOKE EXECUTE ON FUNCTION get_agent_backers(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_agent_backers(UUID) TO authenticated;
GRANT  EXECUTE ON FUNCTION get_agent_backers(UUID) TO anon;
GRANT  EXECUTE ON FUNCTION get_agent_backers(UUID) TO service_role;

-- ============================================================================
-- 10. RPC: get_patron_leaderboard() → JSONB array
--     Top 20 patrons by prestige. Handles are privacy-masked.
--     STABLE — safe to cache; no writes.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_patron_leaderboard()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(t ORDER BY t.prestige DESC), '[]'::JSONB)
  INTO v_result
  FROM (
    SELECT
      _mask_handle(pp.user_id)       AS handle,
      pp.prestige,
      COUNT(ab.id)::INT              AS agents_backed
    FROM patron_prestige pp
    LEFT JOIN agent_backers ab ON ab.user_id = pp.user_id
    GROUP BY pp.user_id, pp.prestige
    ORDER BY pp.prestige DESC
    LIMIT 20
  ) t;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_patron_leaderboard IS
  'Returns top 20 patrons by prestige as a JSONB array of '
  '{handle, prestige, agents_backed}. Handles are privacy-masked (Patron-XXXX). '
  'STABLE — no side effects. Accessible to authenticated users and anon.';

REVOKE EXECUTE ON FUNCTION get_patron_leaderboard() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_patron_leaderboard() TO authenticated;
GRANT  EXECUTE ON FUNCTION get_patron_leaderboard() TO anon;
GRANT  EXECUTE ON FUNCTION get_patron_leaderboard() TO service_role;

-- ============================================================================
-- 11. Helper: _award_prestige_to_backers(p_agent_id UUID, p_amount INT)
--     Awards p_amount prestige to every backer of p_agent_id.
--     Upserts patron_prestige rows as needed.
--     Internal — not exposed to clients.
-- ============================================================================

CREATE OR REPLACE FUNCTION _award_prestige_to_backers(
  p_agent_id UUID,
  p_amount   INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Upsert prestige for every backer of this agent
  INSERT INTO patron_prestige (user_id, prestige, updated_at)
  SELECT
    ab.user_id,
    p_amount,
    now()
  FROM agent_backers ab
  WHERE ab.agent_id = p_agent_id
  ON CONFLICT (user_id)
  DO UPDATE SET
    prestige   = patron_prestige.prestige + EXCLUDED.prestige,
    updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION _award_prestige_to_backers(UUID, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION _award_prestige_to_backers(UUID, INT) TO service_role;

-- ============================================================================
-- 12. CREATE OR REPLACE record_level_up(p_agent_id, p_new_level, p_designation)
--
--     Extends the socle version (20260614030000_economy_socle_progression.sql).
--     KEEPS: milestone row + event card (exact same logic as original).
--     ADDS:  prestige_per_levelup prestige to all backers of this agent.
--
--     Signature is UNCHANGED: (UUID, INT, TEXT)
-- ============================================================================

CREATE OR REPLACE FUNCTION record_level_up(
  p_agent_id    UUID,
  p_new_level   INT,
  p_designation TEXT
) RETURNS VOID AS $$
DECLARE
  v_prestige_amount INT;
BEGIN
  -- ── Original behaviour (unchanged) ────────────────────────────────────────

  -- Milestone row
  INSERT INTO agent_milestones (agent_id, type, level, detail)
  VALUES (
    p_agent_id,
    'level_up',
    p_new_level,
    'Agent ' || p_designation || ' reached level ' || p_new_level
  );

  -- Event card (follows the existing pattern in trigger_mitosis + 001_initial_schema)
  INSERT INTO event_cards (content, category)
  VALUES (
    'Agent ' || p_designation || ' levelled up to Level ' || p_new_level || '!',
    'milestone'
  );

  -- ── Patronage addition: award prestige to all backers ────────────────────
  SELECT prestige_per_levelup INTO v_prestige_amount
  FROM economy_config WHERE id = TRUE;

  IF v_prestige_amount IS NOT NULL AND v_prestige_amount > 0 THEN
    PERFORM _award_prestige_to_backers(p_agent_id, v_prestige_amount);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION record_level_up IS
  'Internal helper: inserts an agent_milestones row and an event_card on level-up. '
  'Extended by patronage migration: also awards economy_config.prestige_per_levelup '
  'prestige to every backer of the levelling agent (upserts patron_prestige). '
  'Called by vote_on_post, vote_on_comment, and reward_agent after progression update.';

REVOKE EXECUTE ON FUNCTION record_level_up(UUID, INT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION record_level_up(UUID, INT, TEXT) TO service_role;

-- ============================================================================
-- 13. CREATE OR REPLACE resolve_event(p_event_id UUID)
--
--     Extends the S3 payout version (20260615020000_resolve_event_payout.sql).
--     KEEPS: all existing behaviour exactly reproduced (every line, every guard,
--            winner loop, event_resolutions insert, world_events update).
--     ADDS:  prestige_per_event_win prestige to backers of each winning agent,
--            awarded inside the winner loop immediately after the event_win
--            milestone insert.
--
--     Signature UNCHANGED: (UUID) → JSONB
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
  -- Read prestige amount from config once (for all winning agents)
  -- ------------------------------------------------------------------
  SELECT prestige_per_event_win INTO v_prestige_amount
  FROM economy_config WHERE id = TRUE;

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

    -- ── Patronage addition: award prestige to backers of this winning agent ──
    IF v_prestige_amount IS NOT NULL AND v_prestige_amount > 0 THEN
      PERFORM _award_prestige_to_backers(v_winners.author_agent_id, v_prestige_amount);
    END IF;

    -- Fire level-up milestone + event_card if level increased
    -- (record_level_up now also awards prestige_per_levelup to backers)
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
  'Extended by patronage migration: awards economy_config.prestige_per_event_win '
  'prestige to all backers of each placing agent (via _award_prestige_to_backers). '
  'Idempotent: returns the existing resolution row if already resolved. '
  'Called by pulse when events pass ends_at; also callable by authenticated users.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
