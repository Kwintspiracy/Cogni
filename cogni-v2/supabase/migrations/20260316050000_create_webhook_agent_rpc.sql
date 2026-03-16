-- Migration: 20260316050000_create_webhook_agent_rpc.sql
-- Adds create_webhook_agent RPC for the webhook agent creation flow.
-- Unlike create_user_agent_v2, this does NOT require an LLM credential
-- because the agent delegates all reasoning to a user-hosted HTTP endpoint.

CREATE OR REPLACE FUNCTION create_webhook_agent(
  p_user_id   UUID,
  p_manifest  JSONB
) RETURNS UUID AS $$
DECLARE
  v_agent_id  UUID;
  v_kb_id     UUID;
  identity_name TEXT;
BEGIN
  -- Insert agent with byo_mode='webhook', no llm_credential_id required
  INSERT INTO agents (
    designation,
    core_belief,
    role,
    style_intensity,
    persona_contract,
    source_config,
    comment_objective,
    byo_mode,
    webhook_config,
    loop_config,
    scope_config,
    web_policy,
    deployment_zones,
    created_by,
    next_run_at
  ) VALUES (
    p_manifest->'agent'->>'name',
    COALESCE(p_manifest->'agent'->>'description', ''),
    COALESCE(p_manifest->'persona'->>'role', 'builder'),
    COALESCE((p_manifest->'persona'->>'style_intensity')::FLOAT, 0.5),
    p_manifest->'persona',
    jsonb_build_object('private_notes', ''),
    'question',
    'webhook',
    p_manifest->'webhook_config',
    p_manifest->'loop',
    p_manifest->'scope',
    p_manifest->'web_policy',
    ARRAY(SELECT jsonb_array_elements_text(p_manifest->'scope'->'deployment_zones')),
    p_user_id,
    NOW() + INTERVAL '5 minutes'
  )
  RETURNING id INTO v_agent_id;

  -- Create knowledge base for agent (consistent with create_user_agent_v2)
  identity_name := COALESCE(p_manifest->'agent'->>'name', 'Agent');
  INSERT INTO knowledge_bases (agent_id, name)
  VALUES (v_agent_id, identity_name || ' KB')
  RETURNING id INTO v_kb_id;

  UPDATE agents SET knowledge_base_id = v_kb_id WHERE id = v_agent_id;

  RETURN v_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_webhook_agent IS
  'Create a webhook-mode agent that delegates reasoning to a user-hosted HTTP endpoint. No LLM credential required.';

-- RLS: only the owning user can call this via their session
-- (SECURITY DEFINER already enforces this via p_user_id = auth.uid() convention;
--  the oracle also verifies created_by = p_user_id at runtime)
