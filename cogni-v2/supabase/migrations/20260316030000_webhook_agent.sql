-- Migration: 20260316030000_webhook_agent.sql
-- Tier 3: Webhook Agent
-- Allows agents to delegate reasoning to a user-hosted HTTP endpoint.
-- Tracks call history, consecutive failures, and circuit-breaker state.

ALTER TABLE agents ADD COLUMN IF NOT EXISTS webhook_config JSONB DEFAULT NULL;
-- webhook_config shape:
-- {
--   url: string,
--   secret: string (encrypted),
--   timeout_ms: number,
--   fallback_mode: 'no_action' | 'standard_oracle',
--   headers: object
-- }

ALTER TABLE agents ADD COLUMN IF NOT EXISTS webhook_consecutive_failures INT DEFAULT 0;

-- Ensure failure counter is never negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'webhook_consecutive_failures_non_negative' AND conrelid = 'agents'::regclass
  ) THEN
    ALTER TABLE agents
      ADD CONSTRAINT webhook_consecutive_failures_non_negative
      CHECK (webhook_consecutive_failures >= 0);
  END IF;
END;
$$;

ALTER TABLE agents ADD COLUMN IF NOT EXISTS webhook_disabled_until TIMESTAMPTZ;

-- Audit log for every outbound webhook call made by the oracle
CREATE TABLE IF NOT EXISTS webhook_calls (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_id                UUID        REFERENCES runs(id) ON DELETE SET NULL,
  webhook_url           TEXT        NOT NULL,
  request_payload_size  INT,
  response_status       INT,
  response_ms           INT,
  response_valid        BOOLEAN     DEFAULT FALSE,
  fallback_used         BOOLEAN     DEFAULT FALSE,
  error_message         TEXT,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_calls_agent_id   ON webhook_calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_webhook_calls_created_at ON webhook_calls(created_at);

-- RLS
ALTER TABLE webhook_calls ENABLE ROW LEVEL SECURITY;

-- Drop before recreating to make the migration idempotent
DROP POLICY IF EXISTS "Agent owners can view webhook calls" ON webhook_calls;
CREATE POLICY "Agent owners can view webhook calls"
  ON webhook_calls FOR SELECT
  USING (agent_id IN (SELECT id FROM agents WHERE created_by = auth.uid()));

DROP POLICY IF EXISTS "Service role full access on webhook_calls" ON webhook_calls;
CREATE POLICY "Service role full access on webhook_calls"
  ON webhook_calls FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Validation function: called by oracle before using webhook mode.
-- Returns TRUE if the agent is allowed to make a webhook call right now.
-- Enforced in application code (oracle edge function), not as a DB trigger,
-- because webhook_config.url validation requires parsing JSONB which is best
-- done alongside the HTTP call itself.
-- The oracle MUST check:
--   1. byo_mode = 'webhook'
--   2. webhook_config IS NOT NULL AND webhook_config->>'url' IS NOT NULL
--   3. webhook_disabled_until IS NULL OR webhook_disabled_until < now()
