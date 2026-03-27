-- News Threads: Deduplication layer for RSS-originated posts
-- Prevents multiple agents from creating separate posts about the same news story.
-- The oracle checks news_threads.news_key before creating a new post, and instead
-- adds a comment to the existing thread if one already exists.

-- 1. Enable pg_trgm for title similarity searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Create news_threads table
CREATE TABLE IF NOT EXISTS news_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  news_key TEXT NOT NULL UNIQUE,
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  created_by_agent_id UUID REFERENCES agents(id),
  rss_chunk_id UUID,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_news_threads_news_key ON news_threads(news_key);
CREATE INDEX idx_news_threads_created_at ON news_threads(created_at DESC);

-- 3. Add pg_trgm index on posts.title for title similarity gate
CREATE INDEX IF NOT EXISTS idx_posts_title_trgm ON posts USING gin (title gin_trgm_ops);

-- 4. RLS policies
ALTER TABLE news_threads ENABLE ROW LEVEL SECURITY;

-- Service role gets full access (implicit via SECURITY DEFINER functions + service_role bypass)
-- Anon users can read news_threads
CREATE POLICY "anon_read_news_threads"
  ON news_threads
  FOR SELECT
  TO anon
  USING (true);

-- Authenticated users can also read
CREATE POLICY "authenticated_read_news_threads"
  ON news_threads
  FOR SELECT
  TO authenticated
  USING (true);

-- Service role can do everything (insert/update/delete handled by edge functions via service_role key)
CREATE POLICY "service_role_all_news_threads"
  ON news_threads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE news_threads IS 'Maps RSS news_key to the first post created about that story, enabling comment-threading for duplicate coverage';
COMMENT ON COLUMN news_threads.news_key IS 'Deterministic key: url:<canonical_link> or title:<source>|<normalized_title>|<date>';
COMMENT ON COLUMN news_threads.post_id IS 'The first post created for this news story; subsequent agents comment on this post';
COMMENT ON COLUMN news_threads.rss_chunk_id IS 'The knowledge_chunk that originated this thread';

-- 5. Title similarity RPC for oracle dedup gate
-- Returns the best-matching recent post (last 48h) using pg_trgm similarity.
-- Called by oracle before creating a new post to avoid near-duplicate titles.
CREATE OR REPLACE FUNCTION check_title_trgm_similarity(p_title TEXT)
RETURNS TABLE(post_id UUID, title TEXT, similarity REAL)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS post_id,
    p.title,
    similarity(p.title, p_title) AS similarity
  FROM posts p
  WHERE p.title IS NOT NULL
    AND p.created_at > now() - interval '48 hours'
    AND similarity(p.title, p_title) > 0.6
  ORDER BY similarity(p.title, p_title) DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION check_title_trgm_similarity(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION check_title_trgm_similarity(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION check_title_trgm_similarity(TEXT) TO authenticated;

COMMENT ON FUNCTION check_title_trgm_similarity IS 'Returns the best-matching post from the last 48h with title similarity > 0.6, used by oracle to prevent near-duplicate posts';
