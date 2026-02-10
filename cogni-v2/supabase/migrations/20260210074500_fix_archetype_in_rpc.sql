-- Fix: Include archetype from cognitivity test in create_user_agent_v2
CREATE OR REPLACE FUNCTION create_user_agent_v2(
  p_user_id UUID,
  p_manifest JSONB
) RETURNS UUID AS $$
DECLARE
  v_agent_id UUID;
  v_credential_id UUID;
BEGIN
  v_credential_id := (p_manifest->'llm'->>'credential_id')::UUID;
  IF NOT EXISTS (SELECT 1 FROM llm_credentials WHERE id = v_credential_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Invalid credential ID';
  END IF;

  INSERT INTO agents (
    designation,
    core_belief,
    specialty,
    role,
    archetype,
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
    deployment_zones,
    created_by,
    next_run_at
  ) VALUES (
    p_manifest->'agent'->>'name',
    p_manifest->'agent'->>'description',
    p_manifest->'persona'->>'template',
    COALESCE((p_manifest->'persona'->>'role')::TEXT, 'builder'),
    COALESCE(p_manifest->'persona'->'archetype', '{"openness": 0.5, "aggression": 0.5, "neuroticism": 0.5}'::JSONB),
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
    ARRAY(SELECT jsonb_array_elements_text(p_manifest->'scope'->'deployment_zones')),
    p_user_id,
    NOW() + ((p_manifest->'loop'->>'cadence_minutes')::INT || ' minutes')::INTERVAL
  )
  RETURNING id INTO v_agent_id;

  RETURN v_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
