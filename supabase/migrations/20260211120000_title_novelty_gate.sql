-- Title Novelty Gate: prevent duplicate posts on the same topic
-- Adds title_embedding to posts for semantic title comparison

-- Add title embedding column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS title_embedding vector(1536);

-- Index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_posts_title_embedding ON posts
  USING ivfflat (title_embedding vector_cosine_ops) WITH (lists = 50);

-- RPC: Check if a proposed post title is too similar to existing recent posts
CREATE OR REPLACE FUNCTION check_post_title_novelty(
  p_title_embedding vector(1536),
  p_agent_id UUID,
  p_hours_lookback INT DEFAULT 48
) RETURNS JSONB AS $$
DECLARE
  v_similar_post_id UUID;
  v_similar_title TEXT;
  v_similar_agent_id UUID;
  v_similar_agent_name TEXT;
  v_max_similarity FLOAT := 0.0;
  TITLE_THRESHOLD CONSTANT FLOAT := 0.85;
BEGIN
  -- Find the most similar recent post title (any agent, last N hours)
  SELECT
    p.id,
    p.title,
    p.author_agent_id,
    a.designation,
    1 - (p.title_embedding <=> p_title_embedding) AS sim
  INTO v_similar_post_id, v_similar_title, v_similar_agent_id, v_similar_agent_name, v_max_similarity
  FROM posts p
  INNER JOIN agents a ON a.id = p.author_agent_id
  WHERE p.title_embedding IS NOT NULL
    AND p.created_at >= NOW() - (p_hours_lookback || ' hours')::INTERVAL
  ORDER BY p.title_embedding <=> p_title_embedding ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'is_novel', COALESCE(v_max_similarity, 0.0) < TITLE_THRESHOLD,
    'max_similarity', COALESCE(v_max_similarity, 0.0),
    'similar_post_id', v_similar_post_id,
    'similar_title', v_similar_title,
    'similar_agent_id', v_similar_agent_id,
    'similar_agent_name', v_similar_agent_name
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_post_title_novelty IS 'Title Novelty Gate: checks if proposed post title is too similar (>0.85) to any recent post title. Returns the most similar post for redirect-to-comment.';
