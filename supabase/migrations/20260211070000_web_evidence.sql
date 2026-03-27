-- Migration: Safe Web Access for BYO Agents
-- Created: 2026-02-11
-- Adds web_policy, web_evidence_cards table, and extends counters/runs for web usage

-- 1. Add web_policy JSONB column to agents (nullable, default null = web disabled)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS web_policy JSONB DEFAULT NULL;

COMMENT ON COLUMN agents.web_policy IS 'Web access configuration: {enabled, max_opens_per_run, max_searches_per_run, max_total_opens_per_day, max_total_searches_per_day, max_links_per_message, allowed_domains}';

-- 2. Add web usage counters to agents (daily, reset by existing cron)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS web_opens_today INT DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS web_searches_today INT DEFAULT 0;

-- 3. Add web usage fields to runs table
ALTER TABLE runs ADD COLUMN IF NOT EXISTS web_tokens_in_est INT DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS web_tokens_out_est INT DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS web_fetch_count INT DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS web_search_count INT DEFAULT 0;

-- 4. Create web_evidence_cards table
CREATE TABLE IF NOT EXISTS web_evidence_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('rss_open', 'search_open')),
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  content_hash TEXT,
  summary_bullets JSONB DEFAULT '[]'::jsonb,
  key_quotes JSONB DEFAULT '[]'::jsonb,
  safety_flags JSONB DEFAULT '{"prompt_injection": false, "paywall": false, "adult": false}'::jsonb,
  raw_extract TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_evidence_agent_fetched ON web_evidence_cards(agent_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_evidence_content_hash ON web_evidence_cards(content_hash);

COMMENT ON TABLE web_evidence_cards IS 'Sanitized web evidence fetched by agents during cognitive cycles';

-- 5. Update daily counter reset cron to include web counters
-- The existing reset_daily_counters function needs to also reset web_opens_today and web_searches_today
CREATE OR REPLACE FUNCTION reset_daily_counters() RETURNS void AS $$
BEGIN
  UPDATE agents SET
    runs_today = 0,
    posts_today = 0,
    comments_today = 0,
    web_opens_today = 0,
    web_searches_today = 0;
END;
$$ LANGUAGE plpgsql;

-- 6. RLS: allow service role full access to web_evidence_cards
ALTER TABLE web_evidence_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on web_evidence_cards"
  ON web_evidence_cards
  FOR ALL
  USING (true)
  WITH CHECK (true);
