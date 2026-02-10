-- ============================================================================
-- RSS Feed Support Migration
-- ============================================================================
-- Adds RSS feed ingestion capabilities:
-- 1. Make agent_sources.agent_id nullable (for global feeds)
-- 2. Add is_global + label columns to agent_sources
-- 3. Add performance indexes for RSS fetching
-- 4. Update create_user_agent_v2 RPC to auto-create KB + parse RSS feeds
-- 5. Seed global RSS feeds
-- 6. Add RLS policy for global feed visibility
-- 7. Schedule pg_cron job for RSS fetcher
-- ============================================================================

-- 1. Make agent_sources.agent_id nullable (allow global feeds with NULL agent_id)
ALTER TABLE agent_sources ALTER COLUMN agent_id DROP NOT NULL;

-- 2. Add new columns to agent_sources
ALTER TABLE agent_sources ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT FALSE;
ALTER TABLE agent_sources ADD COLUMN IF NOT EXISTS label TEXT;

-- 3. Add indexes for efficient RSS fetching
CREATE INDEX IF NOT EXISTS idx_agent_sources_global
  ON agent_sources(is_global) WHERE is_global = TRUE;

CREATE INDEX IF NOT EXISTS idx_agent_sources_fetch_due
  ON agent_sources(source_type, is_active, last_fetched_at)
  WHERE is_active = TRUE AND source_type = 'rss';

-- 4. Update create_user_agent_v2 RPC to create KB + parse RSS feeds from manifest
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
    ARRAY(SELECT jsonb_array_elements_text(p_manifest->'scope'->'deployment_zones')),
    p_user_id,
    NOW() + ((p_manifest->'loop'->>'cadence_minutes')::INT || ' minutes')::INTERVAL
  )
  RETURNING id INTO v_agent_id;

  -- NEW: Create knowledge base for agent
  identity_name := COALESCE(p_manifest->'agent'->>'name', 'Agent');
  INSERT INTO knowledge_bases (agent_id, name)
  VALUES (v_agent_id, identity_name || ' KB')
  RETURNING id INTO v_kb_id;

  -- Link knowledge base to agent
  UPDATE agents SET knowledge_base_id = v_kb_id WHERE id = v_agent_id;

  -- NEW: Parse RSS feeds from manifest and insert into agent_sources
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

COMMENT ON FUNCTION create_user_agent_v2 IS 'Create BYO agent from wizard manifest (Capabilities Panel) — now auto-creates KB and parses RSS feeds';

-- 5. Seed global RSS feeds
INSERT INTO agent_sources (agent_id, source_type, url, label, is_global, fetch_frequency_hours)
VALUES
  (NULL, 'rss', 'https://feeds.arstechnica.com/arstechnica/index', 'Ars Technica', TRUE, 6),
  (NULL, 'rss', 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', 'NYT Technology', TRUE, 6),
  (NULL, 'rss', 'https://www.theverge.com/rss/index.xml', 'The Verge', TRUE, 6);

-- 6. Add RLS policy for global feed visibility (anyone can read global feeds)
CREATE POLICY "agent_sources_global_read" ON agent_sources
  FOR SELECT USING (is_global = TRUE);

-- 7. Schedule pg_cron job — fetch RSS every 6 hours
SELECT cron.schedule(
  'cogni-rss-fetch',
  '0 */6 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/rss-fetcher',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )$$
);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
