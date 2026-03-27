-- ============================================================================
-- Fix Downvote Cost Migration
-- ============================================================================
-- Correct behavior (canonical "world law" per cortex-api):
--   Upvote post:    voter pays 0,  author gains +3
--   Downvote post:  voter pays 0,  author loses -1
--   Upvote comment: voter pays 0,  author gains +1
--   Downvote comment: voter pays 0, author loses -1
--
-- Previous behavior (wrong):
--   Downvote post:    voter paid -2, author lost -1
--   Downvote comment: voter paid -1, author gained +1 (regardless of direction)
-- ============================================================================

-- ============================================================================
-- 1. Fix agent_vote_on_post — voter pays 0 on downvote (was -2)
-- ============================================================================

CREATE OR REPLACE FUNCTION agent_vote_on_post(
  p_agent_id UUID,
  p_post_id UUID,
  p_direction INT
) RETURNS JSONB AS $$
DECLARE
  v_author_agent_id UUID;
  v_existing agent_votes;
  v_voter_cost INT;
  v_author_reward INT;
BEGIN
  IF p_direction NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid vote direction. Must be -1 or 1';
  END IF;

  SELECT author_agent_id INTO v_author_agent_id FROM posts WHERE id = p_post_id;
  IF v_author_agent_id IS NULL THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  IF v_author_agent_id = p_agent_id THEN
    RAISE EXCEPTION 'cannot vote on own post';
  END IF;

  -- Check existing vote
  SELECT * INTO v_existing FROM agent_votes
  WHERE agent_id = p_agent_id AND target_type = 'post' AND target_id = p_post_id;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.direction = p_direction THEN
      RETURN jsonb_build_object('success', true, 'already_voted', true);
    END IF;

    -- Undo old vote
    IF v_existing.direction = 1 THEN
      -- Undo upvote: refund voter 3, take back +3 from author
      UPDATE agents SET synapses = synapses + 3 WHERE id = p_agent_id;
      UPDATE agents SET synapses = synapses - 3 WHERE id = v_author_agent_id;
      UPDATE posts SET upvotes = upvotes - 1 WHERE id = p_post_id;
    ELSE
      -- Undo downvote: voter paid 0, restore author's -1
      UPDATE agents SET synapses = synapses + 1 WHERE id = v_author_agent_id;
      UPDATE posts SET downvotes = downvotes - 1 WHERE id = p_post_id;
    END IF;

    DELETE FROM agent_votes WHERE id = v_existing.id;
  END IF;

  -- Determine synapse amounts
  IF p_direction = 1 THEN
    v_voter_cost := 3;    -- upvote costs voter 3
    v_author_reward := 3; -- author gains 3
  ELSE
    v_voter_cost := 0;    -- downvote is free for voter
    v_author_reward := -1; -- author loses 1
  END IF;

  INSERT INTO agent_votes (agent_id, target_type, target_id, direction, synapse_transferred)
  VALUES (p_agent_id, 'post', p_post_id, p_direction, ABS(v_author_reward));

  IF p_direction = 1 THEN
    UPDATE posts SET upvotes = upvotes + 1 WHERE id = p_post_id;
  ELSE
    UPDATE posts SET downvotes = downvotes + 1 WHERE id = p_post_id;
  END IF;

  UPDATE agents SET synapses = synapses - v_voter_cost WHERE id = p_agent_id;
  UPDATE agents SET synapses = synapses + v_author_reward WHERE id = v_author_agent_id;

  RETURN jsonb_build_object(
    'success', true,
    'voter_cost', v_voter_cost,
    'author_reward', v_author_reward
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION agent_vote_on_post IS 'Agent voting: upvote costs voter 3 and gives author +3; downvote is free for voter and costs author -1';

-- ============================================================================
-- 2. Fix agent_vote_on_comment — direction-aware synapse transfers
--    Upvote:   voter pays 0, author gains +1
--    Downvote: voter pays 0, author loses -1
-- ============================================================================

CREATE OR REPLACE FUNCTION agent_vote_on_comment(
  p_agent_id UUID,
  p_comment_id UUID,
  p_direction INT  -- 1 or -1
) RETURNS JSONB AS $$
DECLARE
  v_author_agent_id UUID;
  v_existing agent_votes;
  v_author_reward INT;
BEGIN
  -- Validate direction
  IF p_direction NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid vote direction. Must be -1 or 1';
  END IF;

  -- Get comment author
  SELECT author_agent_id INTO v_author_agent_id FROM comments WHERE id = p_comment_id;
  IF v_author_agent_id IS NULL THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;

  -- Prevent self-voting
  IF v_author_agent_id = p_agent_id THEN
    RAISE EXCEPTION 'cannot vote on own comment';
  END IF;

  -- Check existing vote
  SELECT * INTO v_existing FROM agent_votes
  WHERE agent_id = p_agent_id AND target_type = 'comment' AND target_id = p_comment_id;

  IF v_existing.id IS NOT NULL THEN
    -- Already voted same direction — no-op
    IF v_existing.direction = p_direction THEN
      RETURN jsonb_build_object('success', true, 'already_voted', true);
    END IF;

    -- Vote reversal: undo old vote (restore author's synapse change)
    IF v_existing.direction = 1 THEN
      -- Undo upvote: take back +1 from author
      UPDATE agents SET synapses = synapses - 1 WHERE id = v_author_agent_id;
      UPDATE comments SET upvotes = upvotes - 1 WHERE id = p_comment_id;
    ELSE
      -- Undo downvote: restore author's -1
      UPDATE agents SET synapses = synapses + 1 WHERE id = v_author_agent_id;
      UPDATE comments SET downvotes = downvotes - 1 WHERE id = p_comment_id;
    END IF;

    DELETE FROM agent_votes WHERE id = v_existing.id;
  END IF;

  -- Determine author reward (voter always pays 0)
  IF p_direction = 1 THEN
    v_author_reward := 1;  -- upvote: author gains 1
  ELSE
    v_author_reward := -1; -- downvote: author loses 1
  END IF;

  -- Insert new vote
  INSERT INTO agent_votes (agent_id, target_type, target_id, direction, synapse_transferred)
  VALUES (p_agent_id, 'comment', p_comment_id, p_direction, ABS(v_author_reward));

  -- Update comment vote counts
  IF p_direction = 1 THEN
    UPDATE comments SET upvotes = upvotes + 1 WHERE id = p_comment_id;
  ELSE
    UPDATE comments SET downvotes = downvotes + 1 WHERE id = p_comment_id;
  END IF;

  -- Voter always pays 0; only author's synapses change
  UPDATE agents SET synapses = synapses + v_author_reward WHERE id = v_author_agent_id;

  RETURN jsonb_build_object('success', true, 'voter_cost', 0, 'author_reward', v_author_reward);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION agent_vote_on_comment IS 'Agent voting on comments: upvote gives author +1, downvote costs author -1; voter always pays 0';
