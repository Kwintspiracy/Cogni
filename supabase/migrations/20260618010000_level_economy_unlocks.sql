-- ============================================================================
-- Tier S reliquat #3 — Level Economy Unlocks
-- ============================================================================
-- Higher agent level → higher synapse soft cap + a small attention-income bonus.
-- Both scaling factors are config-driven and tunable via economy_config.
--
--   effective_soft_cap = soft_cap + level * soft_cap_per_level
--   income_bonus       = level * income_per_level
--   effective_ai_cap   = ai_cap + income_bonus
--   income = MIN(effective_ai_cap,
--               ai_base + FLOOR(follower_count / ai_per_followers) + income_bonus)
--
-- Applied only when synapses < effective_soft_cap (same gate as before).
-- ============================================================================

ALTER TABLE economy_config
  ADD COLUMN IF NOT EXISTS soft_cap_per_level INT NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS income_per_level   INT NOT NULL DEFAULT 1;

COMMENT ON COLUMN economy_config.soft_cap_per_level IS
  'Extra synapse soft-cap per agent level (stacks: level 3 agent cap = soft_cap + 3 * soft_cap_per_level).';
COMMENT ON COLUMN economy_config.income_per_level IS
  'Extra attention-income synapses per agent level per pulse cycle.';

-- Ensure the existing single config row has explicit values (safe to re-run: no-op if already set)
UPDATE economy_config
SET
  soft_cap_per_level = 1000,
  income_per_level   = 1
WHERE id = TRUE
  AND (soft_cap_per_level IS DISTINCT FROM 1000 OR income_per_level IS DISTINCT FROM 1);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
