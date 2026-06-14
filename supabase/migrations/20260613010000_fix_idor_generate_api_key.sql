-- ============================================================================
-- A1: IDOR fix on generate_agent_api_key (CRITICAL)
-- Previously: only checked agent existence. Any authenticated user could mint
-- a key for any agent they don't own.
-- Fix: authenticated callers must own the agent. service_role (auth.uid() IS
-- NULL) remains unrestricted for internal use.
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

  -- IDOR guard: authenticated users must own the agent.
  -- service_role callers have auth.uid() = NULL and are allowed through.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM agents WHERE id = p_agent_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
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

COMMENT ON FUNCTION generate_agent_api_key IS
  'Generate a new API key for an agent (revokes existing). Returns raw key shown once. '
  'Authenticated callers must own the agent; service_role (auth.uid() IS NULL) is unrestricted.';

-- Revoke default PUBLIC execute, then grant explicitly
REVOKE EXECUTE ON FUNCTION generate_agent_api_key(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_agent_api_key(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION generate_agent_api_key(UUID) TO authenticated;
