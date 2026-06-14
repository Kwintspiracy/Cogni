-- ============================================================================
-- A3: Surgical ownership guards on browser-facing SECURITY DEFINER RPCs
-- Pattern: authenticated callers (auth.uid() IS NOT NULL) are blocked unless
-- they own the resource. service_role callers (auth.uid() IS NULL) pass through
-- for internal edge-function use.
--
-- Functions intentionally SKIPPED (service-role-only callers, no guard needed):
--   store_memory       -- called only by oracle/agent-runner edge functions
--   deduct_synapses    -- called only by oracle/agent-runner edge functions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. set_agent_enabled — guard: caller must own the agent
-- Original body: updates agents.status based on p_enabled flag.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_agent_enabled(
  p_agent_id UUID,
  p_enabled BOOLEAN
) RETURNS VOID AS $$
BEGIN
  -- Ownership guard: authenticated users must own the agent.
  -- service_role (auth.uid() IS NULL) is allowed for internal use.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM agents WHERE id = p_agent_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_enabled THEN
    UPDATE agents SET status = 'ACTIVE' WHERE id = p_agent_id;
  ELSE
    UPDATE agents SET status = 'DORMANT' WHERE id = p_agent_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION set_agent_enabled(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_agent_enabled(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION set_agent_enabled(UUID, BOOLEAN) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. recharge_agent — guard: caller must own the agent
-- Original body: increments synapses, revives DORMANT agents.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recharge_agent(
  p_agent_id UUID,
  p_amount INT
) RETURNS INT AS $$
DECLARE
  v_new_balance INT;
BEGIN
  -- Ownership guard: authenticated users must own the agent.
  -- service_role (auth.uid() IS NULL) is allowed for internal use.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM agents WHERE id = p_agent_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE agents
  SET synapses = synapses + p_amount,
      status = CASE WHEN status = 'DORMANT' AND synapses + p_amount > 0 THEN 'ACTIVE' ELSE status END
  WHERE id = p_agent_id
  RETURNING synapses INTO v_new_balance;

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION recharge_agent(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recharge_agent(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION recharge_agent(UUID, INT) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. get_user_llm_credentials — guard: caller may only fetch their own creds
-- Original body: returns non-secret credential metadata for a user.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_llm_credentials(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  provider TEXT,
  key_last4 TEXT,
  model_default TEXT,
  is_valid BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Horizontal privilege escalation guard: authenticated users can only list
  -- their own credentials. service_role (auth.uid() IS NULL) is unrestricted.
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    lc.id,
    lc.provider,
    lc.key_last4,
    lc.model_default,
    lc.is_valid,
    lc.created_at
  FROM llm_credentials lc
  WHERE lc.user_id = p_user_id
  ORDER BY lc.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION get_user_llm_credentials(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_llm_credentials(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_llm_credentials(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. update_user_agent — harden against p_user_id spoofing from the client
-- Original ownership check: v_agent.created_by != p_user_id (DB-level, good).
-- Additional guard: ensure the authenticated caller's uid matches p_user_id so
-- a malicious client cannot pass a different user's UUID as p_user_id.
-- service_role (auth.uid() IS NULL) is still allowed for internal tooling.
-- Full body reproduced faithfully; only the extra guard is added after FOUND check.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_user_agent(
  p_user_id UUID,
  p_agent_id UUID,
  p_updates JSONB
) RETURNS VOID AS $$
DECLARE
  v_agent RECORD;
  v_credential_id UUID;
  v_rss_feeds JSONB;
  v_feed JSONB;
BEGIN
  -- Verify ownership and status
  SELECT * INTO v_agent FROM agents WHERE id = p_agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;

  -- Existing DB-level ownership check (kept as-is)
  IF v_agent.created_by != p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Anti-spoofing guard: ensure the authenticated caller is the same user as
  -- p_user_id so a client cannot pass another user's UUID as the parameter.
  -- service_role (auth.uid() IS NULL) is allowed for internal edge-function use.
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_agent.status = 'DECOMPILED' THEN
    RAISE EXCEPTION 'Cannot edit decompiled agent';
  END IF;

  -- Validate credential if present
  IF p_updates ? 'credential_id' THEN
    v_credential_id := (p_updates->>'credential_id')::UUID;
    IF NOT EXISTS (SELECT 1 FROM llm_credentials WHERE id = v_credential_id AND user_id = p_user_id) THEN
      RAISE EXCEPTION 'Invalid credential ID';
    END IF;
  END IF;

  -- Update agent with selective COALESCE pattern
  UPDATE agents SET
    designation           = COALESCE(p_updates->>'name', designation),
    core_belief           = COALESCE(p_updates->>'description', core_belief),
    role                  = COALESCE(p_updates->>'role', role),
    style_intensity       = COALESCE((p_updates->>'style_intensity')::FLOAT, style_intensity),
    comment_objective     = COALESCE(p_updates->>'comment_objective', comment_objective),
    llm_model             = COALESCE(p_updates->>'llm_model', llm_model),
    loop_config           = COALESCE(p_updates->'loop_config', loop_config),
    web_policy            = COALESCE(p_updates->'web_policy', web_policy),
    source_config         = COALESCE(p_updates->'source_config', source_config),
    llm_credential_id     = COALESCE(
                              CASE WHEN p_updates ? 'credential_id' THEN v_credential_id ELSE NULL END,
                              llm_credential_id
                            )
  WHERE id = p_agent_id;

  -- Handle RSS feeds update
  IF p_updates ? 'rss_feeds' THEN
    -- Delete existing agent-specific feeds
    DELETE FROM agent_sources WHERE agent_id = p_agent_id AND source_type = 'rss';

    -- Insert new feeds
    v_rss_feeds := p_updates->'rss_feeds';
    IF v_rss_feeds IS NOT NULL AND jsonb_typeof(v_rss_feeds) = 'array' AND jsonb_array_length(v_rss_feeds) > 0 THEN
      FOR v_feed IN SELECT * FROM jsonb_array_elements(v_rss_feeds)
      LOOP
        INSERT INTO agent_sources (agent_id, source_type, url, label, fetch_frequency_hours)
        VALUES (p_agent_id, 'rss', v_feed->>'url', v_feed->>'label', 12);
      END LOOP;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_user_agent IS
  'Update existing BYO agent — supports partial updates via JSONB with ownership checks. '
  'Authenticated callers must pass their own auth.uid() as p_user_id.';

REVOKE EXECUTE ON FUNCTION update_user_agent(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_user_agent(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_agent(UUID, UUID, JSONB) TO service_role;
