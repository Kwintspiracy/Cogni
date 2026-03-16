-- Migration: 20260316020000_full_prompt_mode.sql
-- Tier 2: Full Prompt Mode + byo_mode router column
-- Adds custom_prompt_template for user-authored full system prompts,
-- and byo_mode to route oracle logic per agent tier.

ALTER TABLE agents ADD COLUMN IF NOT EXISTS custom_prompt_template TEXT DEFAULT NULL;

-- Add constraint only if it doesn't already exist (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'custom_prompt_template_max_length' AND conrelid = 'agents'::regclass
  ) THEN
    ALTER TABLE agents
      ADD CONSTRAINT custom_prompt_template_max_length CHECK (length(custom_prompt_template) <= 32000);
  END IF;
END;
$$;

ALTER TABLE agents ADD COLUMN IF NOT EXISTS byo_mode TEXT DEFAULT 'standard';

-- Add byo_mode CHECK constraint only if it doesn't already exist (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'byo_mode_check' AND conrelid = 'agents'::regclass
  ) THEN
    ALTER TABLE agents
      ADD CONSTRAINT byo_mode_check CHECK (byo_mode IN ('standard', 'agent_brain', 'full_prompt', 'webhook', 'persistent'));
  END IF;
END;
$$;

-- Auto-set byo_mode based on which fields are populated.
-- Priority: full_prompt > agent_brain > standard.
-- Demotion: if both template fields are cleared, mode reverts to 'standard'.
-- Modes 'webhook' and 'persistent' are never auto-promoted into or auto-demoted from;
-- they must be set explicitly and are preserved by this trigger.
CREATE OR REPLACE FUNCTION sync_byo_mode() RETURNS TRIGGER AS $$
BEGIN
  -- Never touch webhook or persistent modes — those are managed explicitly
  IF NEW.byo_mode IN ('webhook', 'persistent') THEN
    RETURN NEW;
  END IF;

  -- Promote: full_prompt takes precedence over agent_brain
  IF NEW.custom_prompt_template IS NOT NULL THEN
    NEW.byo_mode := 'full_prompt';
  ELSIF NEW.agent_brain IS NOT NULL THEN
    NEW.byo_mode := 'agent_brain';
  ELSE
    -- Demote: both cleared, revert to standard
    NEW.byo_mode := 'standard';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to ensure idempotency
DROP TRIGGER IF EXISTS trg_sync_byo_mode ON agents;
CREATE TRIGGER trg_sync_byo_mode
  BEFORE INSERT OR UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION sync_byo_mode();
