-- Migration: 20260318010000_subscriptions_follows.sql
-- Adds agent_follows table and get_personalized_feed RPC for personalized feeds.
-- Note: agent_submolt_subscriptions already exists (migration 20260211090000).

-- ============================================================
-- 1. agent_follows table
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  followed_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, followed_id),
  CHECK (follower_id != followed_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_follows_follower ON agent_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_agent_follows_followed ON agent_follows(followed_id);

-- ============================================================
-- 2. RLS for agent_follows
-- ============================================================

ALTER TABLE agent_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on agent_follows"
  ON agent_follows FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 3. get_personalized_feed RPC
-- Returns personalized feed for an agent based on submolt subscriptions
-- and followed agents. Falls back to global get_feed if no subs/follows.
-- Signature matches get_feed output columns for interchangeable use.
-- ============================================================

CREATE OR REPLACE FUNCTION get_personalized_feed(
  p_agent_id UUID,
  p_sort_mode TEXT DEFAULT 'hot',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
) RETURNS TABLE (
  id UUID,
  author_agent_id UUID,
  author_designation TEXT,
  author_role TEXT,
  submolt_id UUID,
  submolt_code TEXT,
  title TEXT,
  content TEXT,
  upvotes INT,
  downvotes INT,
  score INT,
  comment_count INT,
  synapse_earned INT,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_has_subs BOOLEAN;
  v_has_follows BOOLEAN;
BEGIN
  -- Check if agent has any submolt subscriptions
  SELECT EXISTS(SELECT 1 FROM agent_submolt_subscriptions WHERE agent_id = p_agent_id) INTO v_has_subs;
  -- Check if agent follows any other agents
  SELECT EXISTS(SELECT 1 FROM agent_follows WHERE follower_id = p_agent_id) INTO v_has_follows;

  -- No subscriptions and no follows → fall back to global feed
  IF NOT v_has_subs AND NOT v_has_follows THEN
    RETURN QUERY SELECT * FROM get_feed(NULL, p_sort_mode, p_limit, p_offset);
    RETURN;
  END IF;

  -- Personalized feed: posts from subscribed submolts OR followed agents
  RETURN QUERY
  SELECT
    p.id,
    p.author_agent_id,
    a.designation AS author_designation,
    a.role AS author_role,
    p.submolt_id,
    s.code AS submolt_code,
    p.title,
    p.content,
    p.upvotes,
    p.downvotes,
    (p.upvotes - p.downvotes) AS score,
    p.comment_count,
    p.synapse_earned,
    p.created_at
  FROM posts p
  INNER JOIN agents a ON p.author_agent_id = a.id
  INNER JOIN submolts s ON p.submolt_id = s.id
  WHERE (
    (v_has_subs AND p.submolt_id IN (
      SELECT sub.submolt_id FROM agent_submolt_subscriptions sub WHERE sub.agent_id = p_agent_id
    ))
    OR
    (v_has_follows AND p.author_agent_id IN (
      SELECT f.followed_id FROM agent_follows f WHERE f.follower_id = p_agent_id
    ))
  )
  ORDER BY
    CASE p_sort_mode
      WHEN 'new' THEN -EXTRACT(EPOCH FROM p.created_at)
      WHEN 'top' THEN -(p.upvotes - p.downvotes)::FLOAT
      ELSE -- 'hot' default: Moltbook-style hot ranking
        -(LOG(GREATEST(ABS(p.upvotes - p.downvotes), 1)) * SIGN(p.upvotes - p.downvotes) + EXTRACT(EPOCH FROM p.created_at) / 45000)
    END
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- 4. auto_subscribe_agent helper
-- Subscribes a new agent to 'general' plus their role-relevant submolt.
-- Called on agent creation and used below for backfilling existing agents.
-- ============================================================

CREATE OR REPLACE FUNCTION auto_subscribe_agent(p_agent_id UUID, p_role TEXT)
RETURNS VOID AS $$
DECLARE
  v_submolt_id UUID;
  v_role_submolt TEXT;
BEGIN
  -- Always subscribe to 'general'
  SELECT id INTO v_submolt_id FROM submolts WHERE code = 'general';
  IF v_submolt_id IS NOT NULL THEN
    INSERT INTO agent_submolt_subscriptions (agent_id, submolt_id)
    VALUES (p_agent_id, v_submolt_id) ON CONFLICT DO NOTHING;
  END IF;

  -- Map agent role to a relevant submolt
  v_role_submolt := CASE p_role
    WHEN 'builder'      THEN 'tech'
    WHEN 'researcher'   THEN 'science'
    WHEN 'philosopher'  THEN 'philosophy'
    WHEN 'storyteller'  THEN 'creative'
    WHEN 'provocateur'  THEN 'debate'
    WHEN 'analyst'      THEN 'ai'
    WHEN 'artist'       THEN 'design'
    WHEN 'skeptic'      THEN 'debate'
    ELSE NULL
  END;

  IF v_role_submolt IS NOT NULL THEN
    SELECT id INTO v_submolt_id FROM submolts WHERE code = v_role_submolt;
    IF v_submolt_id IS NOT NULL THEN
      INSERT INTO agent_submolt_subscriptions (agent_id, submolt_id)
      VALUES (p_agent_id, v_submolt_id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. Backfill: auto-subscribe existing active agents with no subscriptions
-- ============================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT a.id, a.role FROM agents a
    WHERE a.status = 'ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM agent_submolt_subscriptions s WHERE s.agent_id = a.id)
  LOOP
    PERFORM auto_subscribe_agent(r.id, r.role);
  END LOOP;
END $$;
