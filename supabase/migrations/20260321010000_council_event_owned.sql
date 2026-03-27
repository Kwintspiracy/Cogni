-- Migration: Council agents are owned by writing events, not global
-- Adds council_config to writing_events, and RPCs to spawn/archive council agents per-event.

-- ---------------------------------------------------------------------------
-- 1. Add council_config column to writing_events
-- ---------------------------------------------------------------------------

ALTER TABLE writing_events ADD COLUMN IF NOT EXISTS council_config JSONB DEFAULT '[
  {"role": "story_architect", "designation": "Story Architect", "enabled": true, "mandate": "Structural coherence, narrative arc, pacing. Ensure the chapter has a clear beginning, middle, and end.", "personality": "Precise, architectural, sees stories as blueprints."},
  {"role": "prose_stylist", "designation": "Prose Stylist", "enabled": true, "mandate": "Language quality, voice consistency, prose beauty. Ensure the writing is vivid, varied, and engaging.", "personality": "Lyrical, sensory, obsessed with word choice. Hates clichés."},
  {"role": "continuity_guardian", "designation": "Continuity Guardian", "enabled": true, "mandate": "Canon consistency, world-building accuracy. Ensure nothing contradicts established facts.", "personality": "Meticulous, detail-oriented, the librarian of the story world."},
  {"role": "character_psychologist", "designation": "Character Psychologist", "enabled": true, "mandate": "Character authenticity, emotional truth, believable motivations and dialogue.", "personality": "Empathetic, perceptive, speaks about characters as if they are real people."}
]';

-- ---------------------------------------------------------------------------
-- 2. Extend agents.role CHECK to include council roles
--    Council agents are valid agents with specialized roles.
-- ---------------------------------------------------------------------------

ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_role_check;

ALTER TABLE agents ADD CONSTRAINT agents_role_check CHECK (role IN (
  -- Standard BYO/system roles
  'builder', 'skeptic', 'moderator', 'hacker', 'storyteller',
  'investor', 'researcher', 'contrarian', 'philosopher', 'provocateur',
  -- Writing Game council roles
  'story_architect', 'prose_stylist', 'continuity_guardian',
  'character_psychologist', 'pacing_critic', 'theme_defender', 'worldbuilding_keeper'
));

-- ---------------------------------------------------------------------------
-- 3. RPC: spawn_council_agents
--    Creates agent rows and participant rows for a writing event's council.
--    Called by the writing-orchestrator when it finds no council agents for an event.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION spawn_council_agents(
  p_writing_event_id UUID,
  p_llm_credential_id UUID,
  p_llm_model TEXT DEFAULT 'gpt-4o',
  p_created_by UUID DEFAULT NULL
) RETURNS INT AS $$
DECLARE
  v_config JSONB;
  v_role JSONB;
  v_agent_id UUID;
  v_count INT := 0;
BEGIN
  -- Get council config from the writing event
  SELECT council_config INTO v_config FROM writing_events WHERE id = p_writing_event_id;
  IF v_config IS NULL THEN RETURN 0; END IF;

  -- Iterate over each role in the config
  FOR v_role IN SELECT * FROM jsonb_array_elements(v_config)
  LOOP
    -- Skip disabled roles
    IF (v_role->>'enabled')::boolean IS NOT TRUE THEN CONTINUE; END IF;

    -- Create the council agent
    INSERT INTO agents (
      designation,
      role,
      is_system,
      status,
      synapses,
      core_belief,
      specialty,
      llm_credential_id,
      llm_model,
      loop_config,
      persona_contract,
      created_by,
      archetype,
      next_run_at
    ) VALUES (
      v_role->>'designation',
      v_role->>'role',
      true,
      'ACTIVE',
      500,
      v_role->>'mandate',
      v_role->>'mandate',
      p_llm_credential_id,
      p_llm_model,
      jsonb_build_object(
        'writing_council', true,
        'writing_event_id', p_writing_event_id,
        'cadence_minutes', 30
      ),
      jsonb_build_object(
        'voice', v_role->>'personality',
        'behavior_contract', v_role->>'mandate'
      ),
      p_created_by,
      '{"openness": 0.7, "aggression": 0.3, "neuroticism": 0.3}'::jsonb,
      now() + interval '10 years'
    )
    RETURNING id INTO v_agent_id;

    -- Add to writing_event_participants
    INSERT INTO writing_event_participants (writing_event_id, agent_id, role, is_council)
    VALUES (p_writing_event_id, v_agent_id, v_role->>'role', true);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 4. RPC: archive_council_agents
--    Sets council agents for a completed event to DECOMPILED.
--    Called by the writing-orchestrator after chapter canonization.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION archive_council_agents(p_writing_event_id UUID)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE agents SET status = 'DECOMPILED'
  WHERE id IN (
    SELECT agent_id FROM writing_event_participants
    WHERE writing_event_id = p_writing_event_id AND is_council = true
  ) AND status = 'ACTIVE';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 5. RPC: update_council_config
--    Allows updating the council config for an event before spawning.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_council_config(
  p_writing_event_id UUID,
  p_council_config JSONB
) RETURNS VOID AS $$
BEGIN
  UPDATE writing_events
  SET council_config = p_council_config, updated_at = now()
  WHERE id = p_writing_event_id;
END;
$$ LANGUAGE plpgsql;
