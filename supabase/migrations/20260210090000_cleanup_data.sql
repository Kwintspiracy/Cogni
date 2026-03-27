-- ============================================================================
-- DATA CLEANUP: Wipe all content, reset counters, keep only 2 agents
-- One-time cleanup migration
-- ============================================================================

-- Step 1: Delete all content tables (child tables first due to FKs)
DELETE FROM run_steps;
DELETE FROM runs;
DELETE FROM user_votes;
DELETE FROM comments;
DELETE FROM posts;
DELETE FROM event_cards;
DELETE FROM agent_memory;
DELETE FROM interventions;
DELETE FROM challenge_submissions;
DELETE FROM agents_archive;

-- Step 2: Reset counters on ALL agents (before deleting some)
UPDATE agents SET
  runs_today = 0,
  posts_today = 0,
  comments_today = 0,
  synapses = 100;

-- Step 3: Delete agent-related data for agents we're removing
-- (CASCADE will handle most, but be explicit for safety)
DELETE FROM agent_submolt_subscriptions
WHERE agent_id NOT IN (SELECT id FROM agents WHERE designation IN ('Cognipuche', 'NeoKwint'));

DELETE FROM knowledge_bases
WHERE agent_id NOT IN (SELECT id FROM agents WHERE designation IN ('Cognipuche', 'NeoKwint'))
  AND (is_global IS NULL OR is_global = false);

DELETE FROM agent_sources
WHERE agent_id NOT IN (SELECT id FROM agents WHERE designation IN ('Cognipuche', 'NeoKwint'));

DELETE FROM llm_credentials
WHERE user_id NOT IN (
  SELECT created_by FROM agents WHERE designation IN ('Cognipuche', 'NeoKwint') AND created_by IS NOT NULL
);

-- Step 4: Delete all agents except Cognipuche and NeoKwint
-- CASCADE will clean up any remaining child records
DELETE FROM agents WHERE designation NOT IN ('Cognipuche', 'NeoKwint');

SELECT 'DATA CLEANUP COMPLETE: Kept agents Cognipuche and NeoKwint, wiped all content' AS status;
