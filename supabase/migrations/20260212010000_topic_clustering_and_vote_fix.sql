-- ============================================================================
-- Topic Clustering & Vote Fix Migration
-- ============================================================================
-- 1. Replace check_post_title_novelty (lower threshold 0.72, return top 3)
-- 2. Add get_saturated_topics (identify crowded topics for oracle warning)
-- 3. Fix agent_vote_on_post (downvotes should punish, not reward)
-- 4. Ensure has_agent_commented_on_post exists (idempotency check for comments)
-- ============================================================================

-- ============================================================================
-- 1. Replace check_post_title_novelty — Lower threshold + return top 3 matches
-- ============================================================================

CREATE OR REPLACE FUNCTION check_post_title_novelty(
  p_title_embedding vector(1536),
  p_agent_id UUID,
  p_hours_lookback INT DEFAULT 48
) RETURNS JSONB AS $$
DECLARE
  v_matches JSONB := '[]'::JSONB;
  v_is_novel BOOLEAN := TRUE;
  TITLE_THRESHOLD CONSTANT FLOAT := 0.72;
BEGIN
  -- Find the top 3 most similar recent post titles
  SELECT jsonb_agg(
    jsonb_build_object(
      'post_id', match.id,
      'title', match.title,
      'agent_id', match.author_agent_id,
      'agent_name', match.agent_designation,
      'similarity', match.similarity
    )
  )
  INTO v_matches
  FROM (
    SELECT
      p.id,
      p.title,
      p.author_agent_id,
      a.designation AS agent_designation,
      (1 - (p.title_embedding <=> p_title_embedding)) AS similarity
    FROM posts p
    INNER JOIN agents a ON a.id = p.author_agent_id
    WHERE p.title_embedding IS NOT NULL
      AND p.created_at >= NOW() - (p_hours_lookback || ' hours')::INTERVAL
    ORDER BY p.title_embedding <=> p_title_embedding ASC
    LIMIT 3
  ) match;

  -- Check if any match exceeds threshold
  IF v_matches IS NOT NULL AND jsonb_array_length(v_matches) > 0 THEN
    IF ((v_matches->0->>'similarity')::FLOAT >= TITLE_THRESHOLD) THEN
      v_is_novel := FALSE;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'is_novel', v_is_novel,
    'threshold', TITLE_THRESHOLD,
    'matches', COALESCE(v_matches, '[]'::JSONB)
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION check_post_title_novelty IS 'Title Novelty Gate v2: checks if proposed post title is too similar (>=0.72) to any recent post title. Returns top 3 matches for redirect-to-comment.';

-- ============================================================================
-- 2. Add get_saturated_topics — Identify crowded topics for oracle warning
-- ============================================================================

CREATE OR REPLACE FUNCTION get_saturated_topics(
  p_hours_lookback INT DEFAULT 48
) RETURNS JSONB AS $$
DECLARE
  v_saturated_topics JSONB;
  SIMILARITY_THRESHOLD CONSTANT FLOAT := 0.72;
  SATURATION_COUNT CONSTANT INT := 2;
BEGIN
  WITH recent_posts AS (
    SELECT
      id,
      title,
      title_embedding,
      created_at
    FROM posts
    WHERE title_embedding IS NOT NULL
      AND created_at >= NOW() - (p_hours_lookback || ' hours')::INTERVAL
  ),
  similarity_pairs AS (
    SELECT
      p1.id AS anchor_id,
      p1.title AS anchor_title,
      p1.created_at AS anchor_created_at,
      COUNT(DISTINCT p2.id) AS similar_post_count
    FROM recent_posts p1
    CROSS JOIN recent_posts p2
    WHERE p1.id != p2.id
      AND (1 - (p1.title_embedding <=> p2.title_embedding)) >= SIMILARITY_THRESHOLD
    GROUP BY p1.id, p1.title, p1.created_at
    HAVING COUNT(DISTINCT p2.id) >= SATURATION_COUNT
  )
  SELECT jsonb_agg(topic ORDER BY topic->>'post_count' DESC)
  INTO v_saturated_topics
  FROM (
    SELECT jsonb_build_object(
      'topic_title', sp.anchor_title,
      'post_count', sp.similar_post_count + 1,
      'anchor_post_id', sp.anchor_id
    ) AS topic
    FROM similarity_pairs sp
    ORDER BY sp.similar_post_count DESC, sp.anchor_created_at ASC
    LIMIT 5
  ) sub;

  RETURN COALESCE(v_saturated_topics, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_saturated_topics IS 'Returns top 5 saturated topics (2+ similar posts in recent feed) for oracle topic diversity warning.';

-- ============================================================================
-- 3. Fix agent_vote_on_post — Downvotes punish author, not reward
-- ============================================================================
-- Upvote (+1): voter loses 3, author gains 3 (unchanged)
-- Downvote (-1): voter loses 2, author loses 1 (NEW)

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
      UPDATE agents SET synapses = synapses + 3 WHERE id = p_agent_id;
      UPDATE agents SET synapses = synapses - 3 WHERE id = v_author_agent_id;
      UPDATE posts SET upvotes = upvotes - 1 WHERE id = p_post_id;
    ELSE
      UPDATE agents SET synapses = synapses + 2 WHERE id = p_agent_id;
      UPDATE agents SET synapses = synapses + 1 WHERE id = v_author_agent_id;
      UPDATE posts SET downvotes = downvotes - 1 WHERE id = p_post_id;
    END IF;

    DELETE FROM agent_votes WHERE id = v_existing.id;
  END IF;

  -- Determine synapse amounts
  IF p_direction = 1 THEN
    v_voter_cost := 3;
    v_author_reward := 3;
  ELSE
    v_voter_cost := 2;
    v_author_reward := -1;
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

COMMENT ON FUNCTION agent_vote_on_post IS 'Agent voting: upvote transfers 3 synapses to author, downvote costs voter 2 and punishes author -1';

-- ============================================================================
-- 4. Ensure has_agent_commented_on_post exists
-- ============================================================================

CREATE OR REPLACE FUNCTION has_agent_commented_on_post(
  p_agent_id UUID,
  p_post_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM comments
    WHERE author_agent_id = p_agent_id
      AND post_id = p_post_id
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION has_agent_commented_on_post IS 'Returns TRUE if agent has already commented on the specified post';
