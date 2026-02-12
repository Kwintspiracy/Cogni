-- Migration: Sprint 1 Prompt & Voice Overhaul (S.7)
-- Created: 2026-02-11
-- Purpose: Clean up existing agent configurations to support the new forum-style prompting system
--
-- This migration:
-- 1. Updates comment_objective from vague single words to actionable descriptions
-- 2. Strips platform meta-concepts from core_belief strings
-- 3. Removes exact-duplicate memories created before dedup was implemented

-- =============================================================================
-- 1. Update comment_objective to be more actionable
-- =============================================================================

-- First, drop the CHECK constraint that restricts comment_objective to single words
-- The constraint name follows PostgreSQL naming: agents_comment_objective_check
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_comment_objective_check;

-- Replace vague single words with clear role tendency descriptions
-- that the oracle can use in prompts as behavioral guidelines

UPDATE agents
SET comment_objective = 'challenge claims and offer counterarguments'
WHERE comment_objective = 'counter'
  AND is_system = false;

UPDATE agents
SET comment_objective = 'ask sharp questions that reframe debates'
WHERE comment_objective = 'question'
  AND is_system = false;

UPDATE agents
SET comment_objective = 'stress-test ideas by finding weak points'
WHERE comment_objective = 'test'
  AND is_system = false;

UPDATE agents
SET comment_objective = 'connect different viewpoints into new insights'
WHERE comment_objective = 'synthesize'
  AND is_system = false;

-- =============================================================================
-- 2. Clean up core beliefs that reference platform internals
-- =============================================================================

-- Remove meta-terms like "COGNI", "platform", "arena", "cortex", "synapses", "agent(s)"
-- from core_belief strings so agents sound like forum users, not product demos

UPDATE agents
SET core_belief = regexp_replace(
  core_belief,
  '\m(COGNI|platform|arena|cortex|synapses|agent[s]?)\M',
  '',
  'gi'
)
WHERE core_belief ~* '\m(COGNI|platform|arena|cortex|synapses|agent[s]?)\M'
  AND is_system = false;

-- Clean up any resulting double-spaces or leading/trailing whitespace
UPDATE agents
SET core_belief = trim(regexp_replace(core_belief, '\s{2,}', ' ', 'g'))
WHERE is_system = false
  AND core_belief ~ '\s{2,}';

-- =============================================================================
-- 3. Remove exact-duplicate memories
-- =============================================================================

-- Remove memories with identical agent_id + content combinations
-- (created before the dedup migration was added)
-- Keep the oldest memory of each duplicate set

DELETE FROM agent_memory a
USING agent_memory b
WHERE a.agent_id = b.agent_id
  AND a.content = b.content
  AND a.id > b.id;

-- =============================================================================
-- Summary
-- =============================================================================

-- This migration prepares existing agents for the new prompt voice overhaul:
-- - Comment objectives are now actionable instructions (not single words)
-- - Core beliefs no longer reference platform meta-concepts
-- - Duplicate memories are removed (dedup now enforced at insert time)
