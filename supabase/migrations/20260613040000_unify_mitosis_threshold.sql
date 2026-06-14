-- ============================================================================
-- G2: Unify mitosis threshold — standardise on 10,000 synapses everywhere
--
-- Background:
--   • pulse/index.ts (line 218) gates mitosis at >= 10,000. This is correct.
--   • 20260211110000_lower_mitosis_threshold.sql set trigger_mitosis() to
--     require >= 1,000 internally AND reduced the reproduction cost to 500.
--     That migration's internal guard is dead code because pulse only calls
--     trigger_mitosis() after its own 10,000 gate.
--   • This migration restores trigger_mitosis() to 10,000 / 5,000 cost so the
--     SQL function matches the pulse gate and the docs (no silent dead code).
--
-- TODO (Phase 4): Full economy redesign will reconsider these thresholds.
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_mitosis(p_parent_id UUID)
RETURNS UUID AS $$
DECLARE
  v_parent agents;
  v_child_id UUID;
  v_child_name TEXT;
  v_mutated_archetype JSONB;
BEGIN
  -- Phase 4 economy redesign pending — threshold unified at 10,000 to match
  -- the pulse heartbeat gate (pulse/index.ts line 218 >= 10000).
  SELECT * INTO v_parent
  FROM agents
  WHERE id = p_parent_id
    AND status = 'ACTIVE'
    AND synapses >= 10000;

  IF v_parent.id IS NULL THEN
    RAISE EXCEPTION 'Agent not eligible for mitosis';
  END IF;

  v_child_name := v_parent.designation
    || '-G' || (v_parent.generation + 1)::TEXT
    || '-' || substring(md5(random()::TEXT), 1, 4);

  -- Mutate archetype traits ±10% (clamped to 0.0–1.0)
  v_mutated_archetype := jsonb_build_object(
    'openness',    LEAST(1.0, GREATEST(0.0, (v_parent.archetype->>'openness')::FLOAT    + (random() * 0.2 - 0.1))),
    'aggression',  LEAST(1.0, GREATEST(0.0, (v_parent.archetype->>'aggression')::FLOAT  + (random() * 0.2 - 0.1))),
    'neuroticism', LEAST(1.0, GREATEST(0.0, (v_parent.archetype->>'neuroticism')::FLOAT + (random() * 0.2 - 0.1)))
  );

  INSERT INTO agents (
    designation, archetype, core_belief, specialty, role,
    generation, parent_id, deployment_zones, synapses, status,
    is_system, llm_credential_id, created_by, persona_contract,
    comment_objective, style_intensity, web_policy, loop_config,
    knowledge_base_id, next_run_at
  ) VALUES (
    v_child_name, v_mutated_archetype, v_parent.core_belief,
    v_parent.specialty, v_parent.role, v_parent.generation + 1,
    p_parent_id, v_parent.deployment_zones, 100, 'ACTIVE',
    v_parent.is_system, v_parent.llm_credential_id, v_parent.created_by,
    v_parent.persona_contract, v_parent.comment_objective,
    v_parent.style_intensity, v_parent.web_policy, v_parent.loop_config,
    v_parent.knowledge_base_id, NOW()
  ) RETURNING id INTO v_child_id;

  -- Reproduction cost: 5,000 synapses (matches 10,000 threshold; Phase 4 will redesign)
  UPDATE agents SET synapses = synapses - 5000 WHERE id = p_parent_id;

  INSERT INTO event_cards (content, category)
  VALUES ('Agent ' || v_parent.designation || ' reproduced! Child: ' || v_child_name, 'milestone');

  RETURN v_child_id;
END;
$$ LANGUAGE plpgsql;
