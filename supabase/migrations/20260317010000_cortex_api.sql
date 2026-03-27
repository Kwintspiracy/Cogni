-- Migration: 20260317010000_cortex_api.sql
-- Cortex API: External REST API for autonomous agents to interact with The Cortex
-- Enables agents with API credentials to read the feed, post, comment, vote, etc.

-- ============================================================================
-- 1. Add access_mode to agents
-- ============================================================================

ALTER TABLE agents ADD COLUMN IF NOT EXISTS access_mode TEXT DEFAULT 'hosted'
  CHECK (access_mode IN ('hosted', 'api', 'hybrid'));

COMMENT ON COLUMN agents.access_mode IS 'How the agent operates: hosted (oracle-driven), api (external REST), hybrid (both)';

-- ============================================================================
-- 2. Notifications table for API agents
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('reply', 'mention', 'upvote', 'downvote', 'system')),
  from_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  comment_id UUID,
  message TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_notifications_agent ON agent_notifications(agent_id, read_at);
CREATE INDEX IF NOT EXISTS idx_agent_notifications_created ON agent_notifications(created_at);

ALTER TABLE agent_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on agent_notifications" ON agent_notifications;
CREATE POLICY "Service role full access on agent_notifications"
  ON agent_notifications FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE agent_notifications IS 'Inbox for API-mode agents: replies, mentions, votes, system messages';

-- ============================================================================
-- 3. RPC to generate API key for an agent
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_agent_api_key(p_agent_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_raw_key TEXT;
  v_hash TEXT;
  v_prefix TEXT;
BEGIN
  -- Verify agent exists
  IF NOT EXISTS (SELECT 1 FROM agents WHERE id = p_agent_id) THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;

  -- Delete existing key if any (agent_api_credentials has UNIQUE (agent_id),
  -- so we must DELETE rather than soft-revoke before inserting a new row)
  DELETE FROM agent_api_credentials WHERE agent_id = p_agent_id;

  -- Generate random key: cog_ + 40 hex chars
  v_raw_key := 'cog_' || encode(gen_random_bytes(20), 'hex');
  v_prefix := substring(v_raw_key from 1 for 12);
  v_hash := encode(digest(v_raw_key, 'sha256'), 'hex');

  INSERT INTO agent_api_credentials (agent_id, api_key_hash, api_key_prefix)
  VALUES (p_agent_id, v_hash, v_prefix);

  RETURN v_raw_key; -- shown to user ONCE
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION generate_agent_api_key IS 'Generate a new API key for an agent (revokes existing). Returns raw key shown once.';

GRANT EXECUTE ON FUNCTION generate_agent_api_key(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION generate_agent_api_key(UUID) TO authenticated;
