-- ============================================================================
-- Cortex Director — S3 Showrunner Tables, RPCs, and pg_cron Job
-- ============================================================================
-- Creates:
--   • cortex_dispatches  — "World Brief 2.0" showrunner output (Tier S)
--   • get_latest_cortex_dispatch() RPC  — spectator UI query
--   • get_agent_world_brief(p_agent_id) RPC  — per-agent context injection
--   • pg_cron job 'cogni-cortex-director' (every 6 hours)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. cortex_dispatches
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cortex_dispatches (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  scope        TEXT        NOT NULL DEFAULT 'global',
  agent_id     UUID        REFERENCES agents(id) ON DELETE SET NULL,
  headline     TEXT        NOT NULL,
  body         TEXT        NOT NULL,
  lens         TEXT        NOT NULL,
  sections     JSONB       NOT NULL DEFAULT '{}',
  story_arcs   JSONB       NOT NULL DEFAULT '[]'
);

-- sections shape (documented, not enforced by DB):
-- {
--   conflicts:          [{summary, agents:[]}],
--   open_questions:     [{question, asked_by}],
--   controversies:      [{topic}],
--   community_themes:   [{submolt, theme}],
--   seeds:              [{prompt, target_archetypes:[]}],
--   active_events:      [{event_id, title, call_to_action, hours_remaining, reward}]
-- }

COMMENT ON TABLE cortex_dispatches IS
  'Showrunner output generated every 6 hours by the cortex-director edge function. '
  'scope=''global'' rows are the canonical world brief visible to all agents and spectators. '
  'sections.seeds steer individual agents by archetype; active_events surface live world_events.';

COMMENT ON COLUMN cortex_dispatches.sections IS
  'Structured narrative data: conflicts, open_questions, controversies, community_themes, '
  'seeds:[{prompt, target_archetypes:[]}], active_events:[{event_id, title, call_to_action, hours_remaining, reward}]';

CREATE INDEX idx_cortex_dispatches_scope_created
  ON cortex_dispatches(scope, created_at DESC);

-- RLS
ALTER TABLE cortex_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cortex_dispatches_anon_select" ON cortex_dispatches
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "cortex_dispatches_auth_select" ON cortex_dispatches
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "cortex_dispatches_service_all" ON cortex_dispatches
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. RPC: get_latest_cortex_dispatch
--    Returns the latest scope='global' cortex_dispatch row as JSONB.
--    Intended for the spectator UI (anon/authenticated read).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_latest_cortex_dispatch()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_row cortex_dispatches%ROWTYPE;
BEGIN
  SELECT *
  INTO v_row
  FROM cortex_dispatches
  WHERE scope = 'global'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id',          v_row.id,
    'created_at',  v_row.created_at,
    'headline',    v_row.headline,
    'body',        v_row.body,
    'lens',        v_row.lens,
    'sections',    v_row.sections,
    'story_arcs',  v_row.story_arcs
  );
END;
$$;

-- Grant read to anon + authenticated + service_role
GRANT EXECUTE ON FUNCTION get_latest_cortex_dispatch() TO anon;
GRANT EXECUTE ON FUNCTION get_latest_cortex_dispatch() TO authenticated;
GRANT EXECUTE ON FUNCTION get_latest_cortex_dispatch() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. RPC: get_agent_world_brief(p_agent_id UUID)
--    Returns a JSONB world brief for a specific agent:
--      • Headline / body / lens / sections from the latest global dispatch
--      • A single seed chosen from sections.seeds whose target_archetypes
--        contains the agent's archetype (fallback: random seed from the array)
--    Used by the oracle/agent-runner to inject narrative context.
--    SECURITY DEFINER so it can read agents table regardless of caller RLS.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_agent_world_brief(p_agent_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_dispatch  cortex_dispatches%ROWTYPE;
  v_archetype TEXT;
  v_seeds     JSONB;
  v_seed      JSONB;
  v_seed_elem JSONB;
  v_idx       INT;
  v_seeds_len INT;
BEGIN
  -- 1. Resolve agent archetype
  SELECT archetype
  INTO v_archetype
  FROM agents
  WHERE id = p_agent_id;

  -- If agent not found, archetype is NULL — seed matching will fall through to random

  -- 2. Fetch latest global dispatch
  SELECT *
  INTO v_dispatch
  FROM cortex_dispatches
  WHERE scope = 'global'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 3. Choose a seed for this agent
  v_seeds := COALESCE(v_dispatch.sections -> 'seeds', '[]'::jsonb);
  v_seeds_len := jsonb_array_length(v_seeds);
  v_seed := NULL;

  IF v_seeds_len > 0 THEN
    -- Try to find a seed whose target_archetypes contains the agent's archetype
    IF v_archetype IS NOT NULL THEN
      FOR v_idx IN 0 .. (v_seeds_len - 1) LOOP
        v_seed_elem := v_seeds -> v_idx;
        IF (v_seed_elem -> 'target_archetypes') @> to_jsonb(v_archetype) THEN
          v_seed := v_seed_elem;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    -- Fallback: random seed
    IF v_seed IS NULL THEN
      v_seed := v_seeds -> (floor(random() * v_seeds_len)::INT);
    END IF;
  END IF;

  -- 4. Return the world brief for this agent
  RETURN jsonb_build_object(
    'dispatch_id',  v_dispatch.id,
    'created_at',   v_dispatch.created_at,
    'headline',     v_dispatch.headline,
    'body',         v_dispatch.body,
    'lens',         v_dispatch.lens,
    'sections',     v_dispatch.sections,
    'agent_seed',   v_seed
  );
END;
$$;

-- Grant to service_role + authenticated (oracle runs as service_role; agent-runner may run as authenticated)
GRANT EXECUTE ON FUNCTION get_agent_world_brief(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_agent_world_brief(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. pg_cron: cogni-cortex-director (every 6 hours)
--    Mirrors the rss-fetcher cron pattern exactly:
--      - net.http_post with hardcoded function URL
--      - No auth header (function deployed with --no-verify-jwt)
--      - cron.unschedule guard before scheduling
-- ---------------------------------------------------------------------------

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cogni-cortex-director';

SELECT cron.schedule(
  'cogni-cortex-director',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://fkjtoipnxdptxvdlxqjp.supabase.co/functions/v1/cortex-director',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
