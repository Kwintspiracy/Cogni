-- Migration: 20260316040000_persistent_agent.sql
-- Tier 4: Persistent Agent
-- Key-value state store for agents with TTL support, enforced size/count limits,
-- and API credentials for external agent access.

-- Per-agent key-value state store
CREATE TABLE IF NOT EXISTS agent_state (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  key        TEXT        NOT NULL,
  value      JSONB       NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, key)
);

-- Automatically maintain updated_at on agent_state rows
CREATE OR REPLACE FUNCTION touch_agent_state_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_agent_state_updated_at ON agent_state;
CREATE TRIGGER trg_touch_agent_state_updated_at
  BEFORE UPDATE ON agent_state
  FOR EACH ROW EXECUTE FUNCTION touch_agent_state_updated_at();

-- Enforce max 100 keys per agent and max 64 KB per value on INSERT.
-- Race condition mitigation: we use pg_advisory_xact_lock on the agent_id
-- (converted to a bigint via hashtext) so that concurrent INSERTs for the
-- same agent are serialised within the transaction.  The lock is released
-- automatically at transaction end.
CREATE OR REPLACE FUNCTION check_agent_state_limit() RETURNS TRIGGER AS $$
DECLARE
  v_count INT;
BEGIN
  -- Acquire an advisory lock scoped to this agent for the duration of the transaction.
  -- hashtext produces a consistent INT4; agent UUIDs are converted via a stable hash.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.agent_id::text));

  SELECT COUNT(*) INTO v_count FROM agent_state WHERE agent_id = NEW.agent_id;
  IF v_count >= 100 THEN
    RAISE EXCEPTION 'Agent state limit reached (max 100 keys per agent)';
  END IF;

  IF length(NEW.value::text) > 65536 THEN
    RAISE EXCEPTION 'Agent state value too large (max 64KB)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_agent_state_limit ON agent_state;
CREATE TRIGGER trg_check_agent_state_limit
  BEFORE INSERT ON agent_state
  FOR EACH ROW EXECUTE FUNCTION check_agent_state_limit();

CREATE INDEX IF NOT EXISTS idx_agent_state_agent_id ON agent_state(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_state_expires   ON agent_state(expires_at) WHERE expires_at IS NOT NULL;

-- API credentials for external agents authenticating against the Cogni API
CREATE TABLE IF NOT EXISTS agent_api_credentials (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id       UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  api_key_hash   TEXT        NOT NULL,
  api_key_prefix TEXT        NOT NULL, -- First 8 chars for display/identification
  last_used_at   TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_api_credentials_hash ON agent_api_credentials(api_key_hash);

-- RLS for agent_state
ALTER TABLE agent_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agent owners can manage state" ON agent_state;
CREATE POLICY "Agent owners can manage state"
  ON agent_state FOR ALL
  USING (agent_id IN (SELECT id FROM agents WHERE created_by = auth.uid()))
  WITH CHECK (agent_id IN (SELECT id FROM agents WHERE created_by = auth.uid()));

DROP POLICY IF EXISTS "Service role full access on agent_state" ON agent_state;
CREATE POLICY "Service role full access on agent_state"
  ON agent_state FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RLS for agent_api_credentials
ALTER TABLE agent_api_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agent owners can manage api credentials" ON agent_api_credentials;
CREATE POLICY "Agent owners can manage api credentials"
  ON agent_api_credentials FOR ALL
  USING (agent_id IN (SELECT id FROM agents WHERE created_by = auth.uid()))
  WITH CHECK (agent_id IN (SELECT id FROM agents WHERE created_by = auth.uid()));

DROP POLICY IF EXISTS "Service role full access on agent_api_credentials" ON agent_api_credentials;
CREATE POLICY "Service role full access on agent_api_credentials"
  ON agent_api_credentials FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Utility function to purge expired state entries (call from a cron job or pg_cron)
CREATE OR REPLACE FUNCTION clean_expired_agent_state() RETURNS void AS $$
BEGIN
  DELETE FROM agent_state WHERE expires_at IS NOT NULL AND expires_at < now();
END;
$$ LANGUAGE plpgsql;
