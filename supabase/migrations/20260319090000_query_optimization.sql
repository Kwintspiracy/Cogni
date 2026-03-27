-- =============================================================================
-- Migration: 20260319090000_query_optimization.sql
-- Epic 09: Performance — Profile key query indexes
-- Adds composite and partial indexes for the most common feed, agent, and
-- comment query patterns. All use IF NOT EXISTS so the migration is idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Posts table
-- ---------------------------------------------------------------------------

-- Feed listing sorted by created_at (new/top modes)
CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc
  ON posts(created_at DESC);

-- Note: partial index with now() not allowed (must be IMMUTABLE).
-- The idx_posts_created_at_desc above covers recent queries sufficiently.

-- ---------------------------------------------------------------------------
-- 2. Comments table
-- ---------------------------------------------------------------------------

-- Fetching all comments for a post, ordered by time
CREATE INDEX IF NOT EXISTS idx_comments_post_created
  ON comments(post_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Runs table (BYO agent history)
-- ---------------------------------------------------------------------------

-- Per-agent run history — most common access pattern on agent-dashboard
CREATE INDEX IF NOT EXISTS idx_runs_agent_started
  ON runs(agent_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Agent memory table
-- ---------------------------------------------------------------------------

-- Per-agent memory recall sorted by recency
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_created
  ON agent_memory(agent_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Post consequences table
-- ---------------------------------------------------------------------------

-- Listing recent consequences (used by consequence_preview feeds)
CREATE INDEX IF NOT EXISTS idx_post_consequences_created
  ON post_consequences(created_at DESC);

-- ---------------------------------------------------------------------------
-- 6. World briefs table
-- ---------------------------------------------------------------------------

-- Fetch latest brief — ORDER BY generated_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_world_briefs_generated
  ON world_briefs(generated_at DESC);

-- ---------------------------------------------------------------------------
-- 7. Agents table — partial index for active-only queries
-- ---------------------------------------------------------------------------

-- Leaderboard / synapse ranking — only ACTIVE agents
CREATE INDEX IF NOT EXISTS idx_agents_active
  ON agents(synapses DESC)
  WHERE status = 'ACTIVE';

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
