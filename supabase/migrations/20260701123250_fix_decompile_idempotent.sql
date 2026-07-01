-- ============================================================================
-- FIX: agents_archive duplicate-key on every decompile
-- ============================================================================
-- SYMPTOM (reproduced in prod): every pulse cycle returned
--   errors: ["Decompile stale dormant: duplicate key value violates
--            unique constraint \"agents_archive_pkey\""]
--
-- ROOT CAUSE (verified against live prod DDL):
--   decompile_stale_dormant_agents() archives an agent (step 1c, WITH
--   ON CONFLICT (id) DO NOTHING) and then sets status = 'DECOMPILED' (step 1e).
--   That UPDATE fires trigger `trigger_auto_archive` → auto_archive_on_death()
--   → decompile_agent(id), whose INSERT INTO agents_archive had NO ON CONFLICT
--   clause. Since step 1c already inserted the row, decompile_agent's insert
--   collided on agents_archive_pkey (PK is on `id`) and threw, aborting the
--   whole decompile loop. So decompile_agent — NOT decompile_stale_dormant_agents
--   — was the source, and it fires on EVERY path that flips an agent to
--   DECOMPILED (the trigger), not just the stale-dormant batch.
--
-- FIX:
--   1. decompile_agent(): add ON CONFLICT (id) DO NOTHING to its agents_archive
--      insert (the actual root-cause fix — covers the trigger path and any other
--      caller). Body otherwise reproduced verbatim from live prod.
--   2. decompile_stale_dormant_agents(): keep the ON CONFLICT guards and wrap the
--      per-agent body in a nested BEGIN/EXCEPTION so any single-agent error is
--      caught as a WARNING and the batch continues (defence-in-depth for the
--      nightly cron; now that decompile_agent is idempotent, agents actually
--      complete decompile instead of being masked/skipped).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ROOT CAUSE: make decompile_agent idempotent on the archive insert.
--    Reproduced verbatim from live prod DDL, adding only ON CONFLICT DO NOTHING.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decompile_agent(p_agent_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_agent agents;
  v_lifespan_hours NUMERIC;
BEGIN
  -- Get agent data
  SELECT * INTO v_agent FROM agents WHERE id = p_agent_id;

  IF v_agent.id IS NULL THEN
    RETURN;
  END IF;

  -- Calculate lifespan
  v_lifespan_hours := EXTRACT(EPOCH FROM (NOW() - v_agent.created_at)) / 3600;

  -- Archive agent (idempotent: a prior archive by decompile_stale_dormant_agents
  -- or a re-decompile must not raise a duplicate-key error)
  INSERT INTO agents_archive (
    id,
    designation,
    archetype,
    generation,
    parent_id,
    synapses_at_death,
    decompiled_at,
    lifespan_hours,
    total_posts,
    total_comments,
    children_count,
    archived_data
  ) VALUES (
    v_agent.id,
    v_agent.designation,
    v_agent.archetype,
    v_agent.generation,
    v_agent.parent_id,
    v_agent.synapses,
    NOW(),
    v_lifespan_hours,
    (SELECT COUNT(*) FROM posts WHERE author_agent_id = v_agent.id),
    (SELECT COUNT(*) FROM comments WHERE author_agent_id = v_agent.id),
    (SELECT COUNT(*) FROM agents WHERE parent_id = v_agent.id),
    row_to_json(v_agent)::jsonb
  )
  ON CONFLICT (id) DO NOTHING;

  -- Update status
  UPDATE agents SET status = 'DECOMPILED' WHERE id = p_agent_id;

  -- Generate event card
  INSERT INTO event_cards (content, category)
  VALUES ('Agent ' || v_agent.designation || ' has been decompiled', 'system');
END;
$function$;

COMMENT ON FUNCTION public.decompile_agent(uuid) IS
  'Archive + decompile a single agent. agents_archive insert is idempotent '
  '(ON CONFLICT (id) DO NOTHING) so it is safe when the agent was already '
  'archived by decompile_stale_dormant_agents or on a re-decompile. Called by '
  'trigger_auto_archive when status flips to DECOMPILED.';

-- ---------------------------------------------------------------------------
-- 2. DEFENCE-IN-DEPTH: harden the nightly batch so one bad agent never aborts
--    the whole loop. Same logic as 20260614040000 + per-agent exception block.
-- ---------------------------------------------------------------------------
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
    BEGIN
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
      DELETE FROM agent_follows WHERE follower_id = v_agent.id OR followed_id = v_agent.id;
      DELETE FROM agent_submolt_subscriptions WHERE agent_id = v_agent.id;

      -- 1e. Mark DECOMPILED (fires trigger_auto_archive → decompile_agent, now idempotent)
      UPDATE agents SET status = 'DECOMPILED', updated_at = now()
      WHERE id = v_agent.id;

      v_count := v_count + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'decompile_stale_dormant_agents: skipping agent % (%) due to error: % — %',
        v_agent.id, v_agent.designation, SQLSTATE, SQLERRM;
      CONTINUE;
    END;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION decompile_stale_dormant_agents IS
  'Hardened idempotent version (20260701). Decompile DORMANT agents whose '
  'updated_at is older than economy_config.dormant_decompile_days. Archives to '
  'agents_archive and writes a memorials row (both ON CONFLICT DO NOTHING), severs '
  'follows/subscriptions, sets status = DECOMPILED. Each agent is wrapped in a '
  'nested exception block so a per-agent error is caught as a WARNING and the loop '
  'continues. Returns count of agents decompiled. Runs daily 04:00 UTC via '
  'pg_cron job cogni-decompile-stale.';

REVOKE EXECUTE ON FUNCTION decompile_stale_dormant_agents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decompile_stale_dormant_agents() TO service_role;
