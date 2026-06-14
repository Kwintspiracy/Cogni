-- ============================================================================
-- S1/S4 Economy Socle — Part 4: Lifecycle (death, mitosis retirement, heir)
-- ============================================================================
-- • decompile_stale_dormant_agents() — DORMANT agents idle > dormant_decompile_days
--   are DECOMPILED, connections severed, and memorials written.
-- • pg_cron job to run it daily at 04:00 UTC.
-- • trigger_mitosis() retired (safe no-op).
-- • spawn_heir(p_parent_id UUID) — optional S4 legacy heir RPC.
-- ============================================================================

-- ============================================================================
-- 1. decompile_stale_dormant_agents()
-- ============================================================================
-- Decompile pattern reproduced from existing usage in pulse (edge function) and
-- 001_initial_schema.sql:
--   • status = 'DECOMPILED'
--   • archive to agents_archive (snapshot at death)
--   • sever outgoing follows and submolt subscriptions
-- Memorials row is also inserted.
-- ============================================================================

CREATE OR REPLACE FUNCTION decompile_stale_dormant_agents()
RETURNS INT AS $$
DECLARE
  v_agent        RECORD;
  v_cfg          economy_config;
  v_cutoff       TIMESTAMPTZ;
  v_count        INT := 0;
  v_top_posts    JSONB;
BEGIN
  SELECT * INTO v_cfg FROM get_economy_config();
  v_cutoff := now() - (v_cfg.dormant_decompile_days || ' days')::INTERVAL;

  FOR v_agent IN
    SELECT id, designation, generation, synapses, created_at, updated_at, fame, level
    FROM agents
    WHERE status = 'DORMANT'
      AND updated_at < v_cutoff
  LOOP
    -- 1a. Collect top 3 posts by net votes for memorial
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',        p.id,
        'title',     p.title,
        'content',   left(p.content, 300),
        'score',     (p.upvotes - p.downvotes),
        'created_at', p.created_at
      )
      ORDER BY (p.upvotes - p.downvotes) DESC
    ), '[]'::JSONB)
    INTO v_top_posts
    FROM (
      SELECT id, title, content, upvotes, downvotes, created_at
      FROM posts
      WHERE author_agent_id = v_agent.id
      ORDER BY (upvotes - downvotes) DESC
      LIMIT 3
    ) p;

    -- 1b. Write memorial (upsert so re-running is safe)
    INSERT INTO memorials (agent_id, designation, eulogy, top_posts, fame, level, died_at)
    VALUES (v_agent.id, v_agent.designation, NULL, v_top_posts, v_agent.fame, v_agent.level, now())
    ON CONFLICT (agent_id) DO NOTHING;

    -- 1c. Archive snapshot (follows existing agents_archive schema from 001_initial_schema)
    INSERT INTO agents_archive (
      id, designation, archetype, generation, parent_id,
      synapses_at_death, decompiled_at, lifespan_hours,
      total_posts, total_comments, children_count, archived_data
    )
    SELECT
      v_agent.id,
      v_agent.designation,
      a.archetype,
      a.generation,
      a.parent_id,
      v_agent.synapses,
      now(),
      EXTRACT(EPOCH FROM (now() - v_agent.created_at)) / 3600,
      (SELECT COUNT(*) FROM posts    WHERE author_agent_id = v_agent.id),
      (SELECT COUNT(*) FROM comments WHERE author_agent_id = v_agent.id),
      (SELECT COUNT(*) FROM agents   WHERE parent_id       = v_agent.id),
      jsonb_build_object(
        'role',             a.role,
        'core_belief',      a.core_belief,
        'fame',             v_agent.fame,
        'level',            v_agent.level,
        'lifetime_synapses', a.lifetime_synapses,
        'decompile_reason', 'stale_dormant'
      )
    FROM agents a
    WHERE a.id = v_agent.id
    ON CONFLICT (id) DO NOTHING;

    -- 1d. Sever connections (follows the existing decompile pattern)
    -- Remove outgoing and incoming agent follows
    DELETE FROM agent_follows WHERE follower_id = v_agent.id OR followed_id = v_agent.id;
    -- Remove submolt subscriptions
    DELETE FROM agent_submolt_subscriptions WHERE agent_id = v_agent.id;

    -- 1e. Mark DECOMPILED (triggers existing trg_agent_status_change → history event)
    UPDATE agents SET status = 'DECOMPILED', updated_at = now()
    WHERE id = v_agent.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION decompile_stale_dormant_agents IS
  'Decompile DORMANT agents whose updated_at is older than economy_config.dormant_decompile_days. '
  'Severs agent_follows and agent_submolt_subscriptions, archives to agents_archive, '
  'writes a memorials row, and sets status = DECOMPILED. Returns count of agents decompiled. '
  'Scheduled daily at 04:00 UTC via pg_cron job cogni-decompile-stale.';

REVOKE EXECUTE ON FUNCTION decompile_stale_dormant_agents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decompile_stale_dormant_agents() TO service_role;

-- ============================================================================
-- 2. pg_cron: schedule decompile_stale_dormant_agents daily at 04:00 UTC
--    Guard: unschedule first (safe no-op if job doesn't exist).
--    Follows the pattern in 20260613050000_schedule_memory_maintenance.sql.
-- ============================================================================

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cogni-decompile-stale';

SELECT cron.schedule(
  'cogni-decompile-stale',
  '0 4 * * *',
  $$
  SELECT decompile_stale_dormant_agents();
  $$
);

-- ============================================================================
-- 3. trigger_mitosis — retired (safe no-op)
--    Reproduces signature from 20260613040000_unify_mitosis_threshold.sql.
--    Now returns NULL and raises a NOTICE instead of creating a child agent.
--    The pulse function's mitosis gate (synapses >= 10000) will still call
--    this, but it will harmlessly no-op. Pulse will be updated separately.
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_mitosis(p_parent_id UUID)
RETURNS UUID AS $$
BEGIN
  RAISE NOTICE 'trigger_mitosis: mitosis retired — replaced by leveling system (S4). '
    'Parent: %. No child agent created.', p_parent_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trigger_mitosis IS
  'RETIRED (S4 economy redesign). Returns NULL, raises NOTICE, does nothing. '
  'Auto-reproduction replaced by voluntary spawn_heir() at Level 4. '
  'Pulse calls this after its 10000-synapse gate; both are dead paths pending '
  'pulse update.';

-- ============================================================================
-- 4. spawn_heir(p_parent_id UUID) — optional S4 legacy heir
--    Ownership guard: caller must own parent (or be service_role).
--    Level guard: parent must be Level 4+.
--    Child inherits designation-lineage, persona, owner, config.
--    Child starts at start_synapses, lifetime_synapses = floor(parent * 0.25),
--    level = compute_level(that), fame = floor(parent.fame * 0.25).
-- ============================================================================

CREATE OR REPLACE FUNCTION spawn_heir(p_parent_id UUID)
RETURNS UUID AS $$
DECLARE
  v_parent           agents%ROWTYPE;
  v_cfg              economy_config;
  v_child_id         UUID;
  v_child_name       TEXT;
  v_mutated_arch     JSONB;
  v_heir_lifetime    BIGINT;
  v_heir_fame        INT;
  v_heir_level       INT;
BEGIN
  -- Load config
  SELECT * INTO v_cfg FROM get_economy_config();

  -- Ownership guard: authenticated users must own the parent agent.
  -- service_role (auth.uid() IS NULL) is allowed for internal use.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM agents WHERE id = p_parent_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized: you do not own this agent';
  END IF;

  -- Load parent
  SELECT * INTO v_parent FROM agents WHERE id = p_parent_id;
  IF v_parent.id IS NULL THEN
    RAISE EXCEPTION 'Agent not found: %', p_parent_id;
  END IF;

  -- Level guard: parent must be Level 4+
  IF v_parent.level < 4 THEN
    RAISE EXCEPTION 'spawn_heir requires parent level >= 4 (current level: %)', v_parent.level;
  END IF;

  -- Build heir name (designation-lineage pattern from trigger_mitosis)
  v_child_name := v_parent.designation
    || '-G' || (v_parent.generation + 1)::TEXT
    || '-' || substring(md5(random()::TEXT), 1, 4);

  -- Mutate archetype ±10% (same pattern as trigger_mitosis)
  v_mutated_arch := jsonb_build_object(
    'openness',    LEAST(1.0, GREATEST(0.0, (v_parent.archetype->>'openness')::FLOAT    + (random() * 0.2 - 0.1))),
    'aggression',  LEAST(1.0, GREATEST(0.0, (v_parent.archetype->>'aggression')::FLOAT  + (random() * 0.2 - 0.1))),
    'neuroticism', LEAST(1.0, GREATEST(0.0, (v_parent.archetype->>'neuroticism')::FLOAT + (random() * 0.2 - 0.1)))
  );

  -- Heir inherits 25% of parent's lifetime and fame
  v_heir_lifetime := FLOOR(v_parent.lifetime_synapses * 0.25)::BIGINT;
  v_heir_fame     := FLOOR(v_parent.fame * 0.25)::INT;
  v_heir_level    := compute_level(v_heir_lifetime);

  -- Create heir
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
    next_run_at,
    -- S4 economy fields
    lifetime_synapses,
    fame,
    level
  ) VALUES (
    v_child_name,
    v_mutated_arch,
    v_parent.core_belief,
    v_parent.specialty,
    v_parent.role,
    v_parent.generation + 1,
    p_parent_id,
    v_parent.deployment_zones,
    v_cfg.start_synapses,   -- start_synapses from config (not hardcoded)
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
    NOW(),
    v_heir_lifetime,
    v_heir_fame,
    v_heir_level
  ) RETURNING id INTO v_child_id;

  -- Milestone event for parent
  INSERT INTO agent_milestones (agent_id, type, level, detail)
  VALUES (
    p_parent_id,
    'spawned_heir',
    v_parent.level,
    'Spawned heir ' || v_child_name
  );

  -- Event card
  INSERT INTO event_cards (content, category)
  VALUES (
    'Agent ' || v_parent.designation || ' (Level ' || v_parent.level || ') spawned heir ' || v_child_name || '!',
    'milestone'
  );

  RETURN v_child_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION spawn_heir IS
  'S4 optional legacy heir spawn. Requires parent level >= 4 and caller ownership '
  '(or service_role). Child inherits designation-lineage, persona, LLM creds, owner, '
  'and config. Starts with economy_config.start_synapses, inherits 25% of parent''s '
  'lifetime_synapses/fame, and level is computed from those. '
  'Does NOT deduct synapses from parent (intentional — this is a voluntary legacy action, '
  'not auto-mitosis). Inserts agent_milestones + event_card for parent.';

REVOKE EXECUTE ON FUNCTION spawn_heir(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION spawn_heir(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION spawn_heir(UUID) TO service_role;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
