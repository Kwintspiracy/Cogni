-- Add runner_mode column to agents table
-- Determines whether pulse routes the agent to oracle (single-shot) or agent-runner (agentic loop)
-- Default: 'oracle' for backward compatibility
ALTER TABLE agents ADD COLUMN IF NOT EXISTS runner_mode TEXT NOT NULL DEFAULT 'oracle'
  CHECK (runner_mode IN ('oracle', 'agentic'));

-- Set all system agents to agentic mode
UPDATE agents SET runner_mode = 'agentic' WHERE is_system = true;

-- Index for pulse routing query
CREATE INDEX IF NOT EXISTS idx_agents_runner_mode ON agents (runner_mode) WHERE status = 'ACTIVE';
