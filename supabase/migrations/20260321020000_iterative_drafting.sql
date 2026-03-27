-- Migration: Iterative Drafting Rework
-- Replaces fragment-competition with iterative drafting (draft → critique → revise → polish → canonize)

-- ============================================================
-- 1. Delete existing test data
-- ============================================================
DELETE FROM fragment_votes;
DELETE FROM writing_fragments;
DELETE FROM writing_briefs;

-- ============================================================
-- 2. Update writing_fragments.fragment_type CHECK constraint
-- Adds: revision, draft, critique, polish to existing types
-- ============================================================
ALTER TABLE writing_fragments DROP CONSTRAINT IF EXISTS writing_fragments_fragment_type_check;
ALTER TABLE writing_fragments ADD CONSTRAINT writing_fragments_fragment_type_check
  CHECK (fragment_type IN ('scene','dialogue','transition','beat','direction','revision','draft','critique','polish'));

-- ============================================================
-- 3. Update writing_fragments.status CHECK constraint
-- Adds: draft, under_review, polished to existing statuses
-- ============================================================
ALTER TABLE writing_fragments DROP CONSTRAINT IF EXISTS writing_fragments_status_check;
ALTER TABLE writing_fragments ADD CONSTRAINT writing_fragments_status_check
  CHECK (status IN ('proposed','rising','contested','revised','merged','shortlisted','selected','canonized','rejected','draft','under_review','polished'));

-- ============================================================
-- 4. Update writing_events.current_phase CHECK constraint
-- Adds: drafting, revision, polish_canonize to existing phases
-- ============================================================
ALTER TABLE writing_events DROP CONSTRAINT IF EXISTS writing_events_current_phase_check;
ALTER TABLE writing_events ADD CONSTRAINT writing_events_current_phase_check
  CHECK (current_phase IN (
    -- Original competition flow
    'propose_compete', 'refine_challenge', 'assemble_canonize', 'completed',
    -- Extended original flow
    'premise_digest', 'opening_competition', 'character_scene_dev',
    'conflict_momentum', 'refinement', 'assembly', 'canonization',
    -- New iterative drafting flow
    'drafting', 'revision', 'polish_canonize'
  ));

-- ============================================================
-- 5. Replace advance_writing_phase RPC to support new phases
-- New flow: drafting → revision → polish_canonize → completed
-- Old flows kept for backwards compatibility
-- ============================================================
CREATE OR REPLACE FUNCTION advance_writing_phase(p_event_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_current_phase TEXT;
  v_next_phase TEXT;
  v_world_event_id UUID;
BEGIN
  SELECT current_phase, world_event_id INTO v_current_phase, v_world_event_id
  FROM writing_events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Writing event % not found', p_event_id;
  END IF;

  IF v_current_phase = 'completed' THEN
    RAISE EXCEPTION 'Writing event % is already completed', p_event_id;
  END IF;

  -- Determine next phase based on current phase
  v_next_phase := CASE v_current_phase
    -- Old competition flow (kept for backwards compat)
    WHEN 'propose_compete'      THEN 'refine_challenge'
    WHEN 'refine_challenge'     THEN 'assemble_canonize'
    WHEN 'assemble_canonize'    THEN 'completed'
    -- New iterative drafting flow
    WHEN 'drafting'             THEN 'revision'
    WHEN 'revision'             THEN 'polish_canonize'
    WHEN 'polish_canonize'      THEN 'completed'
    -- Extended old flow
    WHEN 'premise_digest'       THEN 'opening_competition'
    WHEN 'opening_competition'  THEN 'character_scene_dev'
    WHEN 'character_scene_dev'  THEN 'conflict_momentum'
    WHEN 'conflict_momentum'    THEN 'refinement'
    WHEN 'refinement'           THEN 'assembly'
    WHEN 'assembly'             THEN 'canonization'
    WHEN 'canonization'         THEN 'completed'
    ELSE 'completed'
  END;

  -- Update the writing event to the next phase
  UPDATE writing_events
  SET current_phase = v_next_phase,
      phase_started_at = now(),
      phase_ends_at = now() + interval '24 hours',
      updated_at = now()
  WHERE id = p_event_id;

  -- If completed, mark the associated world_event as ended
  IF v_next_phase = 'completed' THEN
    UPDATE world_events SET status = 'ended', updated_at = now()
    WHERE id = v_world_event_id;
  END IF;

  -- If entering assemble_canonize, auto-shortlist top 10 scoring fragments
  IF v_next_phase = 'assemble_canonize' THEN
    UPDATE writing_fragments
    SET status = 'shortlisted'
    WHERE writing_event_id = p_event_id
      AND status NOT IN ('rejected', 'shortlisted')
      AND score >= 2.0
      AND id IN (
        SELECT id FROM writing_fragments
        WHERE writing_event_id = p_event_id
          AND status NOT IN ('rejected', 'shortlisted')
        ORDER BY score DESC
        LIMIT 10
      );
  END IF;

  RETURN v_next_phase;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. Reset active writing events to the new drafting phase
-- Clears chapter_text and canon so the new flow starts fresh
-- ============================================================
UPDATE writing_events
SET current_phase = 'drafting',
    phase_started_at = now(),
    phase_ends_at = now() + interval '24 hours',
    chapter_text = NULL,
    canon = NULL,
    updated_at = now()
WHERE current_phase != 'completed';
