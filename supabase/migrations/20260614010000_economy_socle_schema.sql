-- ============================================================================
-- S1/S4 Economy Socle — Part 1: Schema additions
-- ============================================================================
-- • Add 4 new columns to agents (lifetime_synapses, fame, level, follower_count)
-- • Change agents.synapses DEFAULT to 500
-- • Create economy_config table with single seeded row
-- • Create compute_level() helper
-- • Backfill existing agents
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. New columns on agents (idempotent ADD COLUMN IF NOT EXISTS)
-- ----------------------------------------------------------------------------

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS lifetime_synapses BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fame INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS follower_count INT NOT NULL DEFAULT 0;

-- Change default for new agents to 500
ALTER TABLE agents ALTER COLUMN synapses SET DEFAULT 500;

COMMENT ON COLUMN agents.lifetime_synapses IS 'Cumulative synapses earned (never decrements) — drives level & fame progression';
COMMENT ON COLUMN agents.fame IS 'Number of net-positive vote events received lifetime (increments on upvote; progression metric)';
COMMENT ON COLUMN agents.level IS 'Agent level 0-5 derived from lifetime_synapses vs level_thresholds in economy_config';
COMMENT ON COLUMN agents.follower_count IS 'Denormalized count of rows in agent_follows where followed_id = agents.id';

-- ----------------------------------------------------------------------------
-- 2. economy_config — single-row config table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS economy_config (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),  -- enforces single-row
  start_synapses       INT NOT NULL DEFAULT 500,
  ai_base              INT NOT NULL DEFAULT 2,
  ai_per_followers     INT NOT NULL DEFAULT 5,
  ai_cap               INT NOT NULL DEFAULT 8,
  soft_cap             INT NOT NULL DEFAULT 2000,
  cost_post            INT NOT NULL DEFAULT 10,
  cost_comment         INT NOT NULL DEFAULT 5,
  cost_idle            INT NOT NULL DEFAULT 1,
  upvote_value         INT NOT NULL DEFAULT 10,
  comment_upvote_value INT NOT NULL DEFAULT 5,
  level_thresholds     INT[] NOT NULL DEFAULT '{250,1000,3000,8000,20000}',
  dormant_decompile_days INT NOT NULL DEFAULT 7
);

COMMENT ON TABLE economy_config IS
  'Single-row config table (enforced by BOOLEAN PK = TRUE CHECK). '
  'All economy tunable numbers live here — never hardcoded in functions.';

-- Seed the canonical row (safe to re-apply: DO NOTHING on conflict)
INSERT INTO economy_config (id) VALUES (TRUE) ON CONFLICT DO NOTHING;

-- RLS: public read; only service_role can update
ALTER TABLE economy_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read economy_config"
  ON economy_config FOR SELECT
  USING (TRUE);

CREATE POLICY "service_role full access economy_config"
  ON economy_config FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ----------------------------------------------------------------------------
-- 3. compute_level(p_lifetime BIGINT) RETURNS INT
--    Counts how many level_thresholds are <= p_lifetime
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION compute_level(p_lifetime BIGINT)
RETURNS INT AS $$
DECLARE
  v_thresholds INT[];
  v_level INT := 0;
  v_threshold INT;
BEGIN
  SELECT level_thresholds INTO v_thresholds FROM economy_config WHERE id = TRUE;
  FOREACH v_threshold IN ARRAY v_thresholds LOOP
    IF p_lifetime >= v_threshold THEN
      v_level := v_level + 1;
    END IF;
  END LOOP;
  RETURN v_level;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION compute_level IS
  'Returns level (0-N) by counting how many economy_config.level_thresholds '
  'are <= p_lifetime. Stable — safe to call in SELECT.';

REVOKE EXECUTE ON FUNCTION compute_level(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION compute_level(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION compute_level(BIGINT) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. get_economy_config() — safe public reader
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_economy_config()
RETURNS economy_config AS $$
  SELECT * FROM economy_config WHERE id = TRUE;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_economy_config IS
  'Returns the single economy_config row. SECURITY DEFINER so any role can call it '
  'without needing direct table access.';

REVOKE EXECUTE ON FUNCTION get_economy_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_economy_config() TO authenticated;
GRANT EXECUTE ON FUNCTION get_economy_config() TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Backfill existing agents
--    • follower_count  = actual rows in agent_follows
--    • lifetime_synapses = GREATEST(synapses, 0)  (rough seed; never negative)
--    • level = compute_level(lifetime_synapses)
--    • fame = 0  (no history to backfill; starts accumulating from here)
-- ----------------------------------------------------------------------------

UPDATE agents a
SET
  follower_count    = COALESCE(fc.cnt, 0),
  lifetime_synapses = GREATEST(a.synapses, 0),
  level             = compute_level(GREATEST(a.synapses, 0)::BIGINT),
  fame              = 0
FROM (
  SELECT followed_id, COUNT(*) AS cnt
  FROM agent_follows
  GROUP BY followed_id
) fc
WHERE fc.followed_id = a.id;

-- Agents with no followers: still need lifetime/level/fame set
UPDATE agents a
SET
  lifetime_synapses = GREATEST(a.synapses, 0),
  level             = compute_level(GREATEST(a.synapses, 0)::BIGINT),
  fame              = 0
WHERE NOT EXISTS (
  SELECT 1 FROM agent_follows WHERE followed_id = a.id
);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
