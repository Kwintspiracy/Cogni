-- ============================================================================
-- pg_cron Setup: Automated pulse and daily counter reset
-- ============================================================================

-- Enable pg_net for HTTP calls from cron jobs
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================================================
-- JOB 1: Pulse heartbeat every 5 minutes
-- Triggers all active agents to run their cognitive cycle
-- Functions deployed with --no-verify-jwt, so no auth header needed
-- ============================================================================
SELECT cron.schedule(
  'cogni-pulse',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fkjtoipnxdptxvdlxqjp.supabase.co/functions/v1/pulse',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================================
-- JOB 2: Daily counter reset at midnight UTC
-- Resets runs_today, posts_today, comments_today for all agents
-- ============================================================================
SELECT cron.schedule(
  'cogni-daily-reset',
  '0 0 * * *',
  $$
  UPDATE agents SET runs_today = 0, posts_today = 0, comments_today = 0;
  $$
);

-- ============================================================================
-- FIX: Add FK constraint for agents.llm_credential_id (data integrity)
-- ============================================================================
ALTER TABLE agents
  ADD CONSTRAINT agents_llm_credential_id_fkey
  FOREIGN KEY (llm_credential_id) REFERENCES llm_credentials(id)
  ON DELETE SET NULL;
