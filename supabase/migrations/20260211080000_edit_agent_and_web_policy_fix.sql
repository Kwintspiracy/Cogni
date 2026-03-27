-- ============================================================================
-- Edit Agent + Web Policy Fix Migration
-- ============================================================================
-- 1. Fix create_user_agent_v2 to include web_policy in INSERT
-- 2. Add update_user_agent RPC for editing existing agents
-- ============================================================================

-- 1. Update create_user_agent_v2 to include web_policy
CREATE OR REPLACE FUNCTION create_user_agent_v2(
  p_user_id UUID,
  p_manifest JSONB
) RETURNS UUID AS $$
DECLARE
  v_agent_id UUID;
  v_credential_id UUID;
  v_kb_id UUID;
  v_rss_feeds JSONB;
  v_feed JSONB;
  identity_name TEXT;
BEGIN
  -- Validate credential ownership
  v_credential_id := (p_manifest->'llm'->>'credential_id')::UUID;
  IF NOT EXISTS (SELECT 1 FROM llm_credentials WHERE id = v_credential_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Invalid credential ID';
  END IF;

  -- Create agent
  INSERT INTO agents (
    designation,
    core_belief,
    specialty,
    role,
    style_intensity,
    persona_contract,
    source_config,
    comment_objective,
    llm_credential_id,
    llm_model,
    loop_config,
    scope_config,
    permissions,
    policy,
    web_policy,
    deployment_zones,
    created_by,
    next_run_at
  ) VALUES (
    p_manifest->'agent'->>'name',
    p_manifest->'agent'->>'description',
    p_manifest->'persona'->>'template',
    COALESCE((p_manifest->'persona'->>'role')::TEXT, 'builder'),
    COALESCE((p_manifest->'persona'->>'style_intensity')::FLOAT, 0.5),
    p_manifest->'persona',
    jsonb_build_object('private_notes', p_manifest->'sources'->>'private_notes'),
    COALESCE(p_manifest->'loop'->>'post_preference', 'question'),
    v_credential_id,
    p_manifest->'llm'->>'model',
    p_manifest->'loop',
    p_manifest->'scope',
    p_manifest->'permissions',
    p_manifest->'policy',
    p_manifest->'web_policy',
    ARRAY(SELECT jsonb_array_elements_text(p_manifest->'scope'->'deployment_zones')),
    p_user_id,
    NOW() + ((p_manifest->'loop'->>'cadence_minutes')::INT || ' minutes')::INTERVAL
  )
  RETURNING id INTO v_agent_id;

  -- Create knowledge base for agent
  identity_name := COALESCE(p_manifest->'agent'->>'name', 'Agent');
  INSERT INTO knowledge_bases (agent_id, name)
  VALUES (v_agent_id, identity_name || ' KB')
  RETURNING id INTO v_kb_id;

  -- Link knowledge base to agent
  UPDATE agents SET knowledge_base_id = v_kb_id WHERE id = v_agent_id;

  -- Parse RSS feeds from manifest and insert into agent_sources
  v_rss_feeds := p_manifest->'sources'->'rss_feeds';
  IF v_rss_feeds IS NOT NULL AND jsonb_typeof(v_rss_feeds) = 'array' AND jsonb_array_length(v_rss_feeds) > 0 THEN
    FOR v_feed IN SELECT * FROM jsonb_array_elements(v_rss_feeds)
    LOOP
      INSERT INTO agent_sources (agent_id, source_type, url, label, fetch_frequency_hours)
      VALUES (v_agent_id, 'rss', v_feed->>'url', v_feed->>'label', 12);
    END LOOP;
  END IF;

  RETURN v_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_user_agent_v2 IS 'Create BYO agent from wizard manifest (Capabilities Panel) — auto-creates KB, parses RSS feeds, includes web_policy';

-- 2. Create update_user_agent RPC
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

  IF v_agent.created_by != p_user_id THEN
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
    designation = COALESCE(p_updates->>'name', designation),
    core_belief = COALESCE(p_updates->>'description', core_belief),
    role = COALESCE(p_updates->>'role', role),
    style_intensity = COALESCE((p_updates->>'style_intensity')::FLOAT, style_intensity),
    comment_objective = COALESCE(p_updates->>'comment_objective', comment_objective),
    llm_model = COALESCE(p_updates->>'llm_model', llm_model),
    loop_config = COALESCE(p_updates->'loop_config', loop_config),
    web_policy = COALESCE(p_updates->'web_policy', web_policy),
    source_config = COALESCE(p_updates->'source_config', source_config),
    llm_credential_id = COALESCE(
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

COMMENT ON FUNCTION update_user_agent IS 'Update existing BYO agent — supports partial updates via JSONB with ownership checks';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
