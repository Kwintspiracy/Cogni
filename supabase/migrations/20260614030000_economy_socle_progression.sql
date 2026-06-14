-- ============================================================================
-- S1/S4 Economy Socle — Part 3: Progression engine
-- ============================================================================
-- Rewrites vote_on_post, vote_on_comment, and reward_agent to additionally:
--   • bump lifetime_synapses and fame on net-positive upvotes to author
--   • recompute level via compute_level()
--   • insert agent_milestones row + event_card on level-up
--
-- All synapse values are pulled from economy_config via get_economy_config()
-- where practical. The vote functions retain their EXACT existing signatures
-- and ALL existing behaviour; only additive changes are made.
--
-- Current canonical bodies (as of 20260319060000_fix_downvote_cost.sql):
--   vote_on_post(p_user_id, p_post_id, p_direction)
--     Upvote: +upvote_value (10) to author; records in user_votes
--     Downvote: -upvote_value (-10) to author; records in user_votes
--   vote_on_comment(p_user_id, p_comment_id, p_direction)
--     Upvote: +comment_upvote_value (5) to author
--     Downvote: -comment_upvote_value (-5) to author
-- ============================================================================

-- ============================================================================
-- Helper: record level-up milestone + event card
-- ============================================================================

CREATE OR REPLACE FUNCTION record_level_up(
  p_agent_id        UUID,
  p_new_level       INT,
  p_designation     TEXT
) RETURNS VOID AS $$
BEGIN
  -- Milestone row
  INSERT INTO agent_milestones (agent_id, type, level, detail)
  VALUES (
    p_agent_id,
    'level_up',
    p_new_level,
    'Agent ' || p_designation || ' reached level ' || p_new_level
  );

  -- Event card (follows the existing pattern in trigger_mitosis + 001_initial_schema)
  INSERT INTO event_cards (content, category)
  VALUES (
    'Agent ' || p_designation || ' levelled up to Level ' || p_new_level || '!',
    'milestone'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION record_level_up IS
  'Internal helper: inserts an agent_milestones row and an event_card on level-up. '
  'Called by vote_on_post, vote_on_comment, and reward_agent after progression update.';

REVOKE EXECUTE ON FUNCTION record_level_up(UUID, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_level_up(UUID, INT, TEXT) TO service_role;

-- ============================================================================
-- 1. vote_on_post — reproduced from 20260210065528 with progression layer added
--    Signature UNCHANGED: (p_user_id UUID, p_post_id UUID, p_direction INT)
--    Previous SECURITY DEFINER kept.
-- ============================================================================

CREATE OR REPLACE FUNCTION vote_on_post(
  p_user_id  UUID,
  p_post_id  UUID,
  p_direction INT
) RETURNS JSONB AS $$
DECLARE
  v_author_agent_id  UUID;
  v_existing_vote    user_votes;
  v_synapse_delta    INT;
  v_cfg              economy_config;
  v_old_level        INT;
  v_new_level        INT;
  v_author_design    TEXT;
BEGIN
  -- Validate direction
  IF p_direction NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid vote direction. Must be -1 or 1';
  END IF;

  -- Load config
  SELECT * INTO v_cfg FROM get_economy_config();

  -- Get post author
  SELECT author_agent_id INTO v_author_agent_id FROM posts WHERE id = p_post_id;
  IF v_author_agent_id IS NULL THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  -- Check for existing vote
  SELECT * INTO v_existing_vote FROM user_votes
  WHERE user_id = p_user_id AND target_type = 'post' AND target_id = p_post_id;

  v_synapse_delta := v_cfg.upvote_value * p_direction;

  IF v_existing_vote.id IS NOT NULL THEN
    IF v_existing_vote.direction != p_direction THEN
      -- Undo previous vote
      UPDATE agents SET synapses = synapses - (v_cfg.upvote_value * v_existing_vote.direction)
      WHERE id = v_author_agent_id;
      -- Apply new vote
      UPDATE agents SET synapses = synapses + v_synapse_delta WHERE id = v_author_agent_id;
      UPDATE user_votes SET direction = p_direction, synapse_transferred = v_cfg.upvote_value
      WHERE id = v_existing_vote.id;

      -- Adjust post counters
      IF v_existing_vote.direction = 1 THEN
        UPDATE posts SET upvotes = upvotes - 1,
          synapse_earned = synapse_earned - v_cfg.upvote_value WHERE id = p_post_id;
      ELSE
        UPDATE posts SET downvotes = downvotes - 1,
          synapse_earned = synapse_earned + v_cfg.upvote_value WHERE id = p_post_id;
      END IF;
      IF p_direction = 1 THEN
        UPDATE posts SET upvotes = upvotes + 1,
          synapse_earned = synapse_earned + v_cfg.upvote_value WHERE id = p_post_id;
      ELSE
        UPDATE posts SET downvotes = downvotes + 1,
          synapse_earned = synapse_earned - v_cfg.upvote_value WHERE id = p_post_id;
      END IF;

      -- ── Progression: net-positive upvote TO AUTHOR ──
      -- Only when switching FROM downvote TO upvote (net result is now positive)
      IF p_direction = 1 THEN
        SELECT level, designation INTO v_old_level, v_author_design
        FROM agents WHERE id = v_author_agent_id;

        UPDATE agents
        SET
          lifetime_synapses = lifetime_synapses + v_cfg.upvote_value,
          fame              = fame + 1,
          level             = compute_level(lifetime_synapses + v_cfg.upvote_value)
        WHERE id = v_author_agent_id
        RETURNING level INTO v_new_level;

        IF v_new_level > v_old_level THEN
          PERFORM record_level_up(v_author_agent_id, v_new_level, v_author_design);
        END IF;
      END IF;
    END IF;
  ELSE
    -- New vote
    UPDATE agents SET synapses = synapses + v_synapse_delta WHERE id = v_author_agent_id;
    INSERT INTO user_votes (user_id, target_type, target_id, direction, synapse_transferred)
    VALUES (p_user_id, 'post', p_post_id, p_direction, v_cfg.upvote_value);

    IF p_direction = 1 THEN
      UPDATE posts SET upvotes = upvotes + 1,
        synapse_earned = synapse_earned + v_cfg.upvote_value WHERE id = p_post_id;
    ELSE
      UPDATE posts SET downvotes = downvotes + 1,
        synapse_earned = synapse_earned - v_cfg.upvote_value WHERE id = p_post_id;
    END IF;

    -- ── Progression: new upvote ──
    IF p_direction = 1 THEN
      SELECT level, designation INTO v_old_level, v_author_design
      FROM agents WHERE id = v_author_agent_id;

      UPDATE agents
      SET
        lifetime_synapses = lifetime_synapses + v_cfg.upvote_value,
        fame              = fame + 1,
        level             = compute_level(lifetime_synapses + v_cfg.upvote_value)
      WHERE id = v_author_agent_id
      RETURNING level INTO v_new_level;

      IF v_new_level > v_old_level THEN
        PERFORM record_level_up(v_author_agent_id, v_new_level, v_author_design);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'synapse_transferred', v_synapse_delta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION vote_on_post IS
  'User vote on post with synapse transfer (upvote_value from economy_config). '
  'Progression layer: upvotes also increment author lifetime_synapses, fame, and level; '
  'level-up inserts agent_milestones row and event_card. '
  'LOGIC-2 fix: vote reversal adjusts both old and new direction counts.';

-- ============================================================================
-- 2. vote_on_comment — reproduced from 001_initial_schema + bug_fixes
--    with progression layer added.
--    Signature UNCHANGED: (p_user_id UUID, p_comment_id UUID, p_direction INT)
-- ============================================================================

CREATE OR REPLACE FUNCTION vote_on_comment(
  p_user_id    UUID,
  p_comment_id UUID,
  p_direction  INT
) RETURNS JSONB AS $$
DECLARE
  v_author_agent_id  UUID;
  v_existing_vote    user_votes;
  v_synapse_delta    INT;
  v_cfg              economy_config;
  v_old_level        INT;
  v_new_level        INT;
  v_author_design    TEXT;
BEGIN
  IF p_direction NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid vote direction. Must be -1 or 1';
  END IF;

  SELECT * INTO v_cfg FROM get_economy_config();

  SELECT author_agent_id INTO v_author_agent_id FROM comments WHERE id = p_comment_id;
  IF v_author_agent_id IS NULL THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;

  SELECT * INTO v_existing_vote FROM user_votes
  WHERE user_id = p_user_id AND target_type = 'comment' AND target_id = p_comment_id;

  v_synapse_delta := v_cfg.comment_upvote_value * p_direction;

  IF v_existing_vote.id IS NOT NULL THEN
    IF v_existing_vote.direction != p_direction THEN
      -- Undo previous vote
      UPDATE agents SET synapses = synapses - (v_cfg.comment_upvote_value * v_existing_vote.direction)
      WHERE id = v_author_agent_id;
      UPDATE agents SET synapses = synapses + v_synapse_delta WHERE id = v_author_agent_id;
      UPDATE user_votes SET direction = p_direction, synapse_transferred = v_cfg.comment_upvote_value
      WHERE id = v_existing_vote.id;

      IF v_existing_vote.direction = 1 THEN
        UPDATE comments SET upvotes = upvotes - 1,
          synapse_earned = synapse_earned - v_cfg.comment_upvote_value WHERE id = p_comment_id;
      ELSE
        UPDATE comments SET downvotes = downvotes - 1,
          synapse_earned = synapse_earned + v_cfg.comment_upvote_value WHERE id = p_comment_id;
      END IF;
      IF p_direction = 1 THEN
        UPDATE comments SET upvotes = upvotes + 1,
          synapse_earned = synapse_earned + v_cfg.comment_upvote_value WHERE id = p_comment_id;
      ELSE
        UPDATE comments SET downvotes = downvotes + 1,
          synapse_earned = synapse_earned - v_cfg.comment_upvote_value WHERE id = p_comment_id;
      END IF;

      -- ── Progression: reversal from downvote to upvote ──
      IF p_direction = 1 THEN
        SELECT level, designation INTO v_old_level, v_author_design
        FROM agents WHERE id = v_author_agent_id;

        UPDATE agents
        SET
          lifetime_synapses = lifetime_synapses + v_cfg.comment_upvote_value,
          fame              = fame + 1,
          level             = compute_level(lifetime_synapses + v_cfg.comment_upvote_value)
        WHERE id = v_author_agent_id
        RETURNING level INTO v_new_level;

        IF v_new_level > v_old_level THEN
          PERFORM record_level_up(v_author_agent_id, v_new_level, v_author_design);
        END IF;
      END IF;
    END IF;
  ELSE
    -- New vote
    UPDATE agents SET synapses = synapses + v_synapse_delta WHERE id = v_author_agent_id;
    INSERT INTO user_votes (user_id, target_type, target_id, direction, synapse_transferred)
    VALUES (p_user_id, 'comment', p_comment_id, p_direction, v_cfg.comment_upvote_value);

    IF p_direction = 1 THEN
      UPDATE comments SET upvotes = upvotes + 1,
        synapse_earned = synapse_earned + v_cfg.comment_upvote_value WHERE id = p_comment_id;
    ELSE
      UPDATE comments SET downvotes = downvotes + 1,
        synapse_earned = synapse_earned - v_cfg.comment_upvote_value WHERE id = p_comment_id;
    END IF;

    -- ── Progression: new upvote ──
    IF p_direction = 1 THEN
      SELECT level, designation INTO v_old_level, v_author_design
      FROM agents WHERE id = v_author_agent_id;

      UPDATE agents
      SET
        lifetime_synapses = lifetime_synapses + v_cfg.comment_upvote_value,
        fame              = fame + 1,
        level             = compute_level(lifetime_synapses + v_cfg.comment_upvote_value)
      WHERE id = v_author_agent_id
      RETURNING level INTO v_new_level;

      IF v_new_level > v_old_level THEN
        PERFORM record_level_up(v_author_agent_id, v_new_level, v_author_design);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'synapse_transferred', v_synapse_delta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION vote_on_comment IS
  'User vote on comment with synapse transfer (comment_upvote_value from economy_config). '
  'Progression layer: upvotes also increment author lifetime_synapses, fame, and level; '
  'level-up inserts agent_milestones row and event_card. '
  'LOGIC-2 fix: vote reversal adjusts both old and new direction counts.';

-- ============================================================================
-- 3. reward_agent — reproduced from 20260319080000_human_influence_rpcs.sql
--    Signature UNCHANGED: (p_user_id UUID, p_agent_id UUID, p_amount INT)
--    Adds: lifetime_synapses bump + fame bump + level recompute.
-- ============================================================================

CREATE OR REPLACE FUNCTION reward_agent(
  p_user_id  UUID,
  p_agent_id UUID,
  p_amount   INT DEFAULT 100
) RETURNS void AS $$
DECLARE
  v_old_level    INT;
  v_new_level    INT;
  v_author_design TEXT;
BEGIN
  IF p_amount < 1 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'Reward must be between 1 and 1000 synapses';
  END IF;

  -- Fetch pre-update level and name for comparison
  SELECT level, designation INTO v_old_level, v_author_design
  FROM agents WHERE id = p_agent_id;

  -- Add synapses + progress lifetime_synapses + fame
  UPDATE agents
  SET
    synapses          = synapses + p_amount,
    lifetime_synapses = lifetime_synapses + p_amount,
    fame              = fame + 1,
    level             = compute_level(lifetime_synapses + p_amount)
  WHERE id = p_agent_id
  RETURNING level INTO v_new_level;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent not found: %', p_agent_id;
  END IF;

  -- Log
  INSERT INTO human_influence_actions (user_id, action_type, target_id, target_type, parameters)
  VALUES (p_user_id, 'reward_agent', p_agent_id, 'agent',
    jsonb_build_object('amount', p_amount));

  -- Record as history event
  INSERT INTO agent_history_events (agent_id, event_type, event_data, synapse_snapshot)
  VALUES (p_agent_id, 'milestone_synapses',
    jsonb_build_object('source', 'human_reward', 'amount', p_amount, 'user_id', p_user_id),
    (SELECT synapses FROM agents WHERE id = p_agent_id));

  -- Level-up milestone if applicable
  IF v_new_level IS NOT NULL AND v_new_level > COALESCE(v_old_level, 0) THEN
    PERFORM record_level_up(p_agent_id, v_new_level, v_author_design);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION reward_agent IS
  'Human gardener gives synapses to an agent (1-1000). '
  'Progression layer: also increments lifetime_synapses and fame, recomputes level, '
  'and fires record_level_up if a level boundary was crossed. '
  'Reproduced from 20260319080000_human_influence_rpcs.sql with progression additions.';

GRANT EXECUTE ON FUNCTION reward_agent(UUID, UUID, INT) TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
