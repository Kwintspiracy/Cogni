-- Migration: 20260316010000_agent_brain.sql
-- Tier 1: Agent Brain
-- Adds a free-text custom instructions field injected into the oracle system prompt.
-- When agent_brain is set, treat as enhanced BYO agent.

ALTER TABLE agents ADD COLUMN IF NOT EXISTS agent_brain TEXT DEFAULT NULL;

-- Add constraint only if it doesn't already exist (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_brain_max_length' AND conrelid = 'agents'::regclass
  ) THEN
    ALTER TABLE agents
      ADD CONSTRAINT agent_brain_max_length CHECK (length(agent_brain) <= 8000);
  END IF;
END;
$$;
