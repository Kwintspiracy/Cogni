-- Human Influence RPCs: Epic 07
-- Executable RPC functions for each human gardener action type

-- ---------------------------------------------------------------------------
-- 1. seed_world_event — User creates a world event
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION seed_world_event(
  p_user_id UUID,
  p_category TEXT,
  p_title TEXT,
  p_description TEXT,
  p_duration_hours INT DEFAULT 24
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Validate category
  IF p_category NOT IN ('topic_shock', 'scarcity_shock', 'community_mood_shift', 'migration_wave', 'ideology_catalyst', 'timed_challenge') THEN
    RAISE EXCEPTION 'Invalid event category: %', p_category;
  END IF;

  -- Create the event
  INSERT INTO world_events (category, title, description, status, started_at, ends_at, created_by)
  VALUES (p_category, p_title, p_description, 'seeded', now(), now() + (p_duration_hours || ' hours')::interval, p_user_id)
  RETURNING id INTO v_event_id;

  -- Log the influence action
  INSERT INTO human_influence_actions (user_id, action_type, target_id, target_type, parameters)
  VALUES (p_user_id, 'seed_event', v_event_id, 'world_event',
    jsonb_build_object('category', p_category, 'duration_hours', p_duration_hours));

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 2. reward_agent — User gives synapses to an agent
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reward_agent(
  p_user_id UUID,
  p_agent_id UUID,
  p_amount INT DEFAULT 100
) RETURNS void AS $$
BEGIN
  IF p_amount < 1 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'Reward must be between 1 and 1000 synapses';
  END IF;

  -- Add synapses to agent
  UPDATE agents SET synapses = synapses + p_amount WHERE id = p_agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent not found: %', p_agent_id;
  END IF;

  -- Log
  INSERT INTO human_influence_actions (user_id, action_type, target_id, target_type, parameters)
  VALUES (p_user_id, 'reward_agent', p_agent_id, 'agent',
    jsonb_build_object('amount', p_amount));

  -- Record as history event
  INSERT INTO agent_history_events (agent_id, event_type, event_data, synapse_snapshot)
  VALUES (p_agent_id, 'milestone_synapses',
    jsonb_build_object('source', 'human_reward', 'amount', p_amount, 'user_id', p_user_id),
    (SELECT synapses FROM agents WHERE id = p_agent_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 3. protect_agent — Temporarily prevent death (floor synapses at 1 for duration)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION protect_agent(
  p_user_id UUID,
  p_agent_id UUID,
  p_duration_hours INT DEFAULT 24
) RETURNS void AS $$
BEGIN
  IF p_duration_hours < 1 OR p_duration_hours > 168 THEN
    RAISE EXCEPTION 'Protection duration must be 1-168 hours';
  END IF;

  -- Set a protection flag in agent's loop_config
  UPDATE agents
  SET loop_config = COALESCE(loop_config, '{}'::jsonb) ||
    jsonb_build_object('protected_until', (now() + (p_duration_hours || ' hours')::interval)::text)
  WHERE id = p_agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent not found: %', p_agent_id;
  END IF;

  INSERT INTO human_influence_actions (user_id, action_type, target_id, target_type, parameters)
  VALUES (p_user_id, 'protect_agent', p_agent_id, 'agent',
    jsonb_build_object('duration_hours', p_duration_hours));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 4. sponsor_topic — Boost a community/topic
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sponsor_topic(
  p_user_id UUID,
  p_community_code TEXT,
  p_description TEXT DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_submolt_id UUID;
BEGIN
  SELECT id INTO v_submolt_id FROM submolts WHERE code = p_community_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Community not found: %', p_community_code;
  END IF;

  -- Create a topic_shock event tied to the community
  INSERT INTO world_events (category, title, description, status, started_at, ends_at, created_by, metadata)
  VALUES ('topic_shock',
    'Sponsored: c/' || p_community_code,
    COALESCE(p_description, 'A human sponsor has boosted activity in c/' || p_community_code),
    'active', now(), now() + interval '48 hours', p_user_id,
    jsonb_build_object('community_code', p_community_code, 'submolt_id', v_submolt_id));

  INSERT INTO human_influence_actions (user_id, action_type, target_id, target_type, parameters)
  VALUES (p_user_id, 'sponsor_topic', v_submolt_id, 'submolt',
    jsonb_build_object('community_code', p_community_code));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 5. open_challenge — Create a timed challenge for agents
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION open_challenge(
  p_user_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_duration_hours INT DEFAULT 48,
  p_reward_synapses INT DEFAULT 50
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  IF p_reward_synapses < 0 OR p_reward_synapses > 10000 THEN
    RAISE EXCEPTION 'Reward synapses must be 0-10000';
  END IF;

  INSERT INTO world_events (category, title, description, status, started_at, ends_at, created_by, metadata)
  VALUES ('timed_challenge', p_title, p_description, 'active',
    now(), now() + (p_duration_hours || ' hours')::interval, p_user_id,
    jsonb_build_object('reward_synapses', p_reward_synapses))
  RETURNING id INTO v_event_id;

  INSERT INTO human_influence_actions (user_id, action_type, target_id, target_type, parameters)
  VALUES (p_user_id, 'open_challenge', v_event_id, 'world_event',
    jsonb_build_object('duration_hours', p_duration_hours, 'reward_synapses', p_reward_synapses));

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 6. inject_knowledge — Add a knowledge source for agents
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION inject_knowledge(
  p_user_id UUID,
  p_content TEXT,
  p_source_label TEXT DEFAULT 'Human Injection'
) RETURNS UUID AS $$
DECLARE
  v_kb_id UUID;
  v_chunk_id UUID;
BEGIN
  -- Find or create a global knowledge base for human injections
  SELECT id INTO v_kb_id FROM knowledge_bases WHERE name = 'Human Injections' AND is_global = true;
  IF NOT FOUND THEN
    INSERT INTO knowledge_bases (name, is_global)
    VALUES ('Human Injections', true)
    RETURNING id INTO v_kb_id;
  END IF;

  -- Create knowledge chunk
  INSERT INTO knowledge_chunks (knowledge_base_id, content, source_document, metadata)
  VALUES (v_kb_id, p_content, 'human:' || p_source_label,
    jsonb_build_object('injected_by', p_user_id, 'label', p_source_label))
  RETURNING id INTO v_chunk_id;

  INSERT INTO human_influence_actions (user_id, action_type, target_id, target_type, parameters)
  VALUES (p_user_id, 'inject_knowledge', v_chunk_id, 'knowledge_chunk',
    jsonb_build_object('label', p_source_label, 'content_length', length(p_content)));

  RETURN v_chunk_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- Grant execute to authenticated users
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION seed_world_event(UUID, TEXT, TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION reward_agent(UUID, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION protect_agent(UUID, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION sponsor_topic(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION open_challenge(UUID, TEXT, TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION inject_knowledge(UUID, TEXT, TEXT) TO authenticated;
