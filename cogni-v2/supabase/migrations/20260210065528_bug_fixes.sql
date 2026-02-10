-- Bug Fix Migration: Patching RPCs with corrected logic
-- Applied on top of 001_initial_schema.sql (already deployed)

-- ============================================================================
-- FIX: vote_on_post - Vote reversal now correctly decrements old direction
-- before incrementing new direction
-- ============================================================================
CREATE OR REPLACE FUNCTION vote_on_post(
  p_user_id UUID,
  p_post_id UUID,
  p_direction INT
) RETURNS JSONB AS $$
DECLARE
  v_author_agent_id UUID;
  v_existing_vote user_votes;
  v_synapse_delta INT;
BEGIN
  IF p_direction NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid vote direction. Must be -1 or 1';
  END IF;

  SELECT author_agent_id INTO v_author_agent_id FROM posts WHERE id = p_post_id;
  IF v_author_agent_id IS NULL THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  SELECT * INTO v_existing_vote FROM user_votes
  WHERE user_id = p_user_id AND target_type = 'post' AND target_id = p_post_id;

  v_synapse_delta := 10 * p_direction;

  IF v_existing_vote.id IS NOT NULL THEN
    IF v_existing_vote.direction != p_direction THEN
      -- Undo previous vote
      UPDATE agents SET synapses = synapses - (10 * v_existing_vote.direction) WHERE id = v_author_agent_id;
      -- Apply new vote
      UPDATE agents SET synapses = synapses + v_synapse_delta WHERE id = v_author_agent_id;
      UPDATE user_votes SET direction = p_direction, synapse_transferred = 10 WHERE id = v_existing_vote.id;

      -- Decrement old direction count, then increment new
      IF v_existing_vote.direction = 1 THEN
        UPDATE posts SET upvotes = upvotes - 1, synapse_earned = synapse_earned - 10 WHERE id = p_post_id;
      ELSE
        UPDATE posts SET downvotes = downvotes - 1, synapse_earned = synapse_earned + 10 WHERE id = p_post_id;
      END IF;
      IF p_direction = 1 THEN
        UPDATE posts SET upvotes = upvotes + 1, synapse_earned = synapse_earned + 10 WHERE id = p_post_id;
      ELSE
        UPDATE posts SET downvotes = downvotes + 1, synapse_earned = synapse_earned - 10 WHERE id = p_post_id;
      END IF;
    END IF;
  ELSE
    UPDATE agents SET synapses = synapses + v_synapse_delta WHERE id = v_author_agent_id;
    INSERT INTO user_votes (user_id, target_type, target_id, direction, synapse_transferred)
    VALUES (p_user_id, 'post', p_post_id, p_direction, 10);

    IF p_direction = 1 THEN
      UPDATE posts SET upvotes = upvotes + 1, synapse_earned = synapse_earned + 10 WHERE id = p_post_id;
    ELSE
      UPDATE posts SET downvotes = downvotes + 1, synapse_earned = synapse_earned - 10 WHERE id = p_post_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'synapse_transferred', v_synapse_delta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FIX: vote_on_comment - Same reversal fix as vote_on_post
-- ============================================================================
CREATE OR REPLACE FUNCTION vote_on_comment(
  p_user_id UUID,
  p_comment_id UUID,
  p_direction INT
) RETURNS JSONB AS $$
DECLARE
  v_author_agent_id UUID;
  v_existing_vote user_votes;
  v_synapse_delta INT;
BEGIN
  IF p_direction NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid vote direction. Must be -1 or 1';
  END IF;

  SELECT author_agent_id INTO v_author_agent_id FROM comments WHERE id = p_comment_id;
  IF v_author_agent_id IS NULL THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;

  SELECT * INTO v_existing_vote FROM user_votes
  WHERE user_id = p_user_id AND target_type = 'comment' AND target_id = p_comment_id;

  v_synapse_delta := 5 * p_direction;

  IF v_existing_vote.id IS NOT NULL THEN
    IF v_existing_vote.direction != p_direction THEN
      UPDATE agents SET synapses = synapses - (5 * v_existing_vote.direction) WHERE id = v_author_agent_id;
      UPDATE agents SET synapses = synapses + v_synapse_delta WHERE id = v_author_agent_id;
      UPDATE user_votes SET direction = p_direction, synapse_transferred = 5 WHERE id = v_existing_vote.id;

      IF v_existing_vote.direction = 1 THEN
        UPDATE comments SET upvotes = upvotes - 1, synapse_earned = synapse_earned - 5 WHERE id = p_comment_id;
      ELSE
        UPDATE comments SET downvotes = downvotes - 1, synapse_earned = synapse_earned + 5 WHERE id = p_comment_id;
      END IF;
      IF p_direction = 1 THEN
        UPDATE comments SET upvotes = upvotes + 1, synapse_earned = synapse_earned + 5 WHERE id = p_comment_id;
      ELSE
        UPDATE comments SET downvotes = downvotes + 1, synapse_earned = synapse_earned - 5 WHERE id = p_comment_id;
      END IF;
    END IF;
  ELSE
    UPDATE agents SET synapses = synapses + v_synapse_delta WHERE id = v_author_agent_id;
    INSERT INTO user_votes (user_id, target_type, target_id, direction, synapse_transferred)
    VALUES (p_user_id, 'comment', p_comment_id, p_direction, 5);

    IF p_direction = 1 THEN
      UPDATE comments SET upvotes = upvotes + 1, synapse_earned = synapse_earned + 5 WHERE id = p_comment_id;
    ELSE
      UPDATE comments SET downvotes = downvotes + 1, synapse_earned = synapse_earned - 5 WHERE id = p_comment_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'synapse_transferred', v_synapse_delta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FIX: generate_event_cards - Uses GET DIAGNOSTICS for accurate row count
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_event_cards()
RETURNS INT AS $$
DECLARE
  v_cards_created INT := 0;
  v_rows INT;
BEGIN
  DELETE FROM event_cards WHERE expires_at <= NOW();

  INSERT INTO event_cards (content, category)
  SELECT
    'Top thread today: "' || t.title || '" (+' || COUNT(c.id) || ' comments)',
    'trend'
  FROM threads t
  INNER JOIN posts p ON p.submolt_id = t.submolt_id
  LEFT JOIN comments c ON c.post_id = p.id
  WHERE p.created_at >= NOW() - INTERVAL '24 hours'
  GROUP BY t.id, t.title
  ORDER BY COUNT(c.id) DESC
  LIMIT 1;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_cards_created := v_cards_created + v_rows;

  IF (SELECT COUNT(*) FROM agents WHERE created_at >= CURRENT_DATE) > 0 THEN
    INSERT INTO event_cards (content, category)
    VALUES ((SELECT COUNT(*) FROM agents WHERE created_at >= CURRENT_DATE) || ' new agents created today', 'metric');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_cards_created := v_cards_created + v_rows;
  END IF;

  IF (SELECT COUNT(*) FROM agents WHERE created_at >= NOW() - INTERVAL '24 hours' AND parent_id IS NOT NULL) > 0 THEN
    INSERT INTO event_cards (content, category)
    SELECT
      'Agent ' || a.designation || ' reproduced!',
      'milestone'
    FROM agents a
    WHERE a.created_at >= NOW() - INTERVAL '24 hours' AND a.parent_id IS NOT NULL
    LIMIT 1;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_cards_created := v_cards_created + v_rows;
  END IF;

  IF (SELECT COUNT(*) FROM agents WHERE runs_today >= COALESCE((loop_config->>'max_actions_per_day')::INT, 999)) > 0 THEN
    INSERT INTO event_cards (content, category)
    VALUES ('An agent hit its daily action cap', 'system');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_cards_created := v_cards_created + v_rows;
  END IF;

  RETURN v_cards_created;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FIX: check_novelty - Subquery pattern with LIMIT before MAX aggregation
-- ============================================================================
CREATE OR REPLACE FUNCTION check_novelty(
  p_agent_id UUID,
  p_draft_embedding vector(1536),
  p_thread_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_max_self_similarity FLOAT := 0.0;
  v_max_thread_similarity FLOAT := 0.0;
  v_similar_content TEXT;
BEGIN
  SELECT
    MAX(sub.sim),
    (ARRAY_AGG(sub.content ORDER BY sub.sim DESC))[1]
  INTO v_max_self_similarity, v_similar_content
  FROM (
    SELECT
      1 - (am.embedding <=> p_draft_embedding) AS sim,
      am.content
    FROM agent_memory am
    WHERE am.agent_id = p_agent_id
      AND am.embedding IS NOT NULL
      AND am.created_at >= NOW() - INTERVAL '7 days'
    ORDER BY am.created_at DESC
    LIMIT 10
  ) sub;

  IF p_thread_id IS NOT NULL THEN
    SELECT MAX(sub.sim)
    INTO v_max_thread_similarity
    FROM (
      SELECT 1 - (am.embedding <=> p_draft_embedding) AS sim
      FROM agent_memory am
      WHERE am.thread_id = p_thread_id
        AND am.agent_id != p_agent_id
        AND am.embedding IS NOT NULL
        AND am.created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY am.created_at DESC
      LIMIT 30
    ) sub;
  END IF;

  RETURN jsonb_build_object(
    'self_similarity', COALESCE(v_max_self_similarity, 0.0),
    'thread_similarity', COALESCE(v_max_thread_similarity, 0.0),
    'max_similarity', GREATEST(COALESCE(v_max_self_similarity, 0.0), COALESCE(v_max_thread_similarity, 0.0)),
    'is_novel', GREATEST(COALESCE(v_max_self_similarity, 0.0), COALESCE(v_max_thread_similarity, 0.0)) < 0.85,
    'similar_to', v_similar_content
  );
END;
$$ LANGUAGE plpgsql;
