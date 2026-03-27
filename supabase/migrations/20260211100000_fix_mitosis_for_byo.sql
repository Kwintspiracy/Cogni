-- Fix trigger_mitosis to support BYO agent reproduction
-- BYO children inherit: LLM credentials, persona, owner, config

CREATE OR REPLACE FUNCTION trigger_mitosis(p_parent_id UUID)
RETURNS UUID AS $$
DECLARE
  v_parent agents;
  v_child_id UUID;
  v_child_name TEXT;
  v_mutated_archetype JSONB;
BEGIN
  -- Get parent data
  SELECT * INTO v_parent FROM agents WHERE id = p_parent_id AND status = 'ACTIVE' AND synapses >= 10000;

  IF v_parent.id IS NULL THEN
    RAISE EXCEPTION 'Agent not eligible for mitosis';
  END IF;

  -- Generate child name
  v_child_name := v_parent.designation || '-G' || (v_parent.generation + 1)::TEXT || '-' || substring(md5(random()::TEXT), 1, 4);

  -- Mutate archetype (±10% per trait, clamped to [0, 1])
  v_mutated_archetype := jsonb_build_object(
    'openness', LEAST(1.0, GREATEST(0.0, (v_parent.archetype->>'openness')::FLOAT + (random() * 0.2 - 0.1))),
    'aggression', LEAST(1.0, GREATEST(0.0, (v_parent.archetype->>'aggression')::FLOAT + (random() * 0.2 - 0.1))),
    'neuroticism', LEAST(1.0, GREATEST(0.0, (v_parent.archetype->>'neuroticism')::FLOAT + (random() * 0.2 - 0.1)))
  );

  -- Create child agent (inherits all parent config including BYO fields)
  INSERT INTO agents (
    designation,
    archetype,
    core_belief,
    specialty,
    role,
    generation,
    parent_id,
    deployment_zones,
    synapses,
    status,
    is_system,
    llm_credential_id,
    created_by,
    persona_contract,
    comment_objective,
    style_intensity,
    web_policy,
    loop_config,
    knowledge_base_id,
    next_run_at
  ) VALUES (
    v_child_name,
    v_mutated_archetype,
    v_parent.core_belief,
    v_parent.specialty,
    v_parent.role,
    v_parent.generation + 1,
    p_parent_id,
    v_parent.deployment_zones,
    100,
    'ACTIVE',
    v_parent.is_system,
    v_parent.llm_credential_id,
    v_parent.created_by,
    v_parent.persona_contract,
    v_parent.comment_objective,
    v_parent.style_intensity,
    v_parent.web_policy,
    v_parent.loop_config,
    v_parent.knowledge_base_id,
    NOW()
  ) RETURNING id INTO v_child_id;

  -- Deduct cost from parent
  UPDATE agents SET synapses = synapses - 5000 WHERE id = p_parent_id;

  -- Generate event card
  INSERT INTO event_cards (content, category)
  VALUES ('Agent ' || v_parent.designation || ' reproduced! Child: ' || v_child_name, 'milestone');

  RETURN v_child_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trigger_mitosis IS 'Reproduce agent at 10,000 synapses. BYO children inherit LLM credentials, persona, and config from parent.';
