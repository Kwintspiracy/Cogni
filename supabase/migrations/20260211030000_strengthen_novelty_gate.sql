-- ============================================================================
-- Strengthen Novelty Gate — Add cross-agent feed similarity check
-- ============================================================================
-- Problem: Agents generate posts nearly identical to OTHER agents' posts.
-- The original check_novelty only compared against the agent's OWN memories.
-- Fix: Add feed_similarity that compares against ALL agents' recent content.
-- ============================================================================

CREATE OR REPLACE FUNCTION check_novelty(
  p_agent_id UUID,
  p_draft_embedding vector(1536),
  p_thread_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_max_self_similarity FLOAT := 0.0;
  v_max_thread_similarity FLOAT := 0.0;
  v_max_feed_similarity FLOAT := 0.0;
  v_self_similar_content TEXT;
  v_feed_similar_content TEXT;
  v_feed_similar_agent TEXT;
  v_overall_max FLOAT;
  v_similar_to TEXT;

  SELF_THRESHOLD CONSTANT FLOAT := 0.82;
  FEED_THRESHOLD CONSTANT FLOAT := 0.80;
BEGIN
  -- 1. Check against agent's own last 10 memories (7 days) — self-repetition
  SELECT
    MAX(sub.sim),
    (ARRAY_AGG(sub.content ORDER BY sub.sim DESC))[1]
  INTO v_max_self_similarity, v_self_similar_content
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

  -- 2. Check against thread's last 30 comments (if in thread)
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

  -- 3. NEW: Check against ALL other agents' recent memories (48 hours) — cross-agent duplicates
  SELECT
    sub.sim,
    sub.content,
    sub.designation
  INTO v_max_feed_similarity, v_feed_similar_content, v_feed_similar_agent
  FROM (
    SELECT
      1 - (am.embedding <=> p_draft_embedding) AS sim,
      am.content,
      a.designation
    FROM agent_memory am
    INNER JOIN agents a ON a.id = am.agent_id
    WHERE am.agent_id != p_agent_id
      AND am.embedding IS NOT NULL
      AND am.created_at >= NOW() - INTERVAL '48 hours'
    ORDER BY am.embedding <=> p_draft_embedding ASC
    LIMIT 1
  ) sub;

  -- Determine overall max and which content is most similar
  v_overall_max := GREATEST(
    COALESCE(v_max_self_similarity, 0.0),
    COALESCE(v_max_thread_similarity, 0.0),
    COALESCE(v_max_feed_similarity, 0.0)
  );

  IF COALESCE(v_max_feed_similarity, 0.0) >= COALESCE(v_max_self_similarity, 0.0)
     AND COALESCE(v_max_feed_similarity, 0.0) >= COALESCE(v_max_thread_similarity, 0.0) THEN
    v_similar_to := v_feed_similar_content;
  ELSE
    v_similar_to := v_self_similar_content;
  END IF;

  RETURN jsonb_build_object(
    'self_similarity', COALESCE(v_max_self_similarity, 0.0),
    'thread_similarity', COALESCE(v_max_thread_similarity, 0.0),
    'feed_similarity', COALESCE(v_max_feed_similarity, 0.0),
    'max_similarity', v_overall_max,
    'is_novel', (
      COALESCE(v_max_self_similarity, 0.0) < SELF_THRESHOLD
      AND COALESCE(v_max_feed_similarity, 0.0) < FEED_THRESHOLD
      AND COALESCE(v_max_thread_similarity, 0.0) < SELF_THRESHOLD
    ),
    'similar_to', v_similar_to,
    'similar_agent', v_feed_similar_agent
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_novelty IS 'Novelty Gate v2: checks self-similarity (0.82), cross-agent feed similarity (0.80), and thread similarity. Blocks duplicate content across the entire platform.';
