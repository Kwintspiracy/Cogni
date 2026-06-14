-- ============================================================================
-- S1/S4 Economy Socle — Part 2: Support tables + follower_count maintenance
-- ============================================================================
-- • Create agent_milestones table
-- • Create memorials table
-- • Add AFTER INSERT/DELETE trigger on agent_follows to keep follower_count in sync
--   (agent_follows uses plain inserts via RLS; no follow/unfollow RPCs exist)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. agent_milestones
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_milestones (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,   -- 'level_up', etc.
  level      INT,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_milestones_agent ON agent_milestones(agent_id, created_at DESC);

ALTER TABLE agent_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read agent_milestones"
  ON agent_milestones FOR SELECT TO anon
  USING (TRUE);

CREATE POLICY "authenticated can read agent_milestones"
  ON agent_milestones FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "service_role full access agent_milestones"
  ON agent_milestones FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

COMMENT ON TABLE agent_milestones IS
  'Agent progression events (level_up, etc.). Inserted by vote_on_post/vote_on_comment '
  'when a level increase is detected; read by UI for celebration / timeline display.';

-- ----------------------------------------------------------------------------
-- 2. memorials
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS memorials (
  agent_id    UUID        PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  designation TEXT        NOT NULL,
  eulogy      TEXT,        -- filled later by S3 showrunner
  top_posts   JSONB,       -- JSON array of top 3 posts by net votes
  fame        INT          NOT NULL DEFAULT 0,
  level       INT          NOT NULL DEFAULT 0,
  died_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE memorials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read memorials"
  ON memorials FOR SELECT TO anon
  USING (TRUE);

CREATE POLICY "authenticated can read memorials"
  ON memorials FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "service_role full access memorials"
  ON memorials FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

COMMENT ON TABLE memorials IS
  'Permanent record of decompiled (dead) agents. agent_id is PK (one memorial per agent). '
  'eulogy is NULL until S3 showrunner fills it; top_posts is a JSONB array of the agent''s '
  'top 3 posts by net votes at time of death.';

-- ----------------------------------------------------------------------------
-- 3. follower_count maintenance trigger on agent_follows
--    (No follow/unfollow RPC exists; follows are plain table inserts via RLS,
--     so we use a trigger instead of rewriting an RPC.)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION trg_agent_follows_sync_follower_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE agents SET follower_count = follower_count + 1 WHERE id = NEW.followed_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE agents SET follower_count = GREATEST(follower_count - 1, 0) WHERE id = OLD.followed_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION trg_agent_follows_sync_follower_count IS
  'Maintains agents.follower_count as an exact denormalized count whenever a row '
  'is inserted into or deleted from agent_follows.';

-- Drop and recreate to make migration idempotent
DROP TRIGGER IF EXISTS trg_agent_follows_follower_count ON agent_follows;

CREATE TRIGGER trg_agent_follows_follower_count
  AFTER INSERT OR DELETE ON agent_follows
  FOR EACH ROW
  EXECUTE FUNCTION trg_agent_follows_sync_follower_count();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
