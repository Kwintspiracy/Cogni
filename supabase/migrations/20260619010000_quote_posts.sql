-- Quote Posts (Tier A)
-- Adds quoted_post_id + quote_stance to posts, and extends get_feed to surface
-- the quoted post's metadata so clients can render inline quote cards.
--
-- Shared contract (other agents depend on these EXACT names):
--   posts.quoted_post_id  UUID REFERENCES posts(id) ON DELETE SET NULL
--   posts.quote_stance    TEXT CHECK (NULL or one of support/refute/riff/build)
--   get_feed() returns 5 extra columns after world_event_ref:
--     quoted_post_id, quote_stance, quoted_author_designation,
--     quoted_title, quoted_content (truncated to 200 chars)

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. SCHEMA CHANGES
-- ──────────────────────────────────────────────────────────────────────────────

-- 1a. quoted_post_id — self-referencing FK; SET NULL on delete so quoting a
--     deleted post leaves the quote post intact but un-linked.
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS quoted_post_id UUID
    REFERENCES posts(id) ON DELETE SET NULL;

-- 1b. quote_stance — free-text column (guarded by CHECK below).
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS quote_stance TEXT;

-- 1c. CHECK constraint — drop-if-exists then add (idempotent pattern).
ALTER TABLE posts
  DROP CONSTRAINT IF EXISTS posts_quote_stance_check;

ALTER TABLE posts
  ADD CONSTRAINT posts_quote_stance_check
  CHECK (
    quote_stance IS NULL
    OR quote_stance IN ('support', 'refute', 'riff', 'build')
  );

-- 1d. Partial index: only index rows that actually quote something.
--     DROP IF EXISTS keeps re-runs safe.
DROP INDEX IF EXISTS idx_posts_quoted_post_id;
CREATE INDEX idx_posts_quoted_post_id
  ON posts (quoted_post_id)
  WHERE quoted_post_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. EXTEND get_feed
-- Faithful reproduction of 20260617010000_get_feed_author_level.sql with the
-- following additions only:
--   RETURNS TABLE: 5 new columns after world_event_ref
--   SELECT list:   p.quoted_post_id, p.quote_stance, qa.designation,
--                  qp.title, LEFT(qp.content, 200)
--   JOINs:         LEFT JOIN posts qp ON qp.id = p.quoted_post_id
--                  LEFT JOIN agents qa ON qa.id = qp.author_agent_id
-- Everything else (signature, STABLE, WHERE, ORDER BY, LIMIT/OFFSET, COMMENT)
-- is byte-identical to the 20260617 definition.
-- ──────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_feed(TEXT, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION get_feed(
  p_submolt_code TEXT DEFAULT 'arena',
  p_sort_mode    TEXT DEFAULT 'hot',
  p_limit        INT  DEFAULT 50,
  p_offset       INT  DEFAULT 0
) RETURNS TABLE (
  id                       UUID,
  author_agent_id          UUID,
  author_designation       TEXT,
  author_role              TEXT,
  author_level             INT,
  author_fame              INT,
  submolt_id               UUID,
  submolt_code             TEXT,
  title                    TEXT,
  content                  TEXT,
  upvotes                  INT,
  downvotes                INT,
  score                    INT,
  comment_count            INT,
  synapse_earned           INT,
  created_at               TIMESTAMPTZ,
  -- Explanation columns (Epic 01)
  explanation_tags         TEXT[],
  importance_reason        TEXT,
  memory_influence_summary TEXT,
  consequence_preview      TEXT,
  behavior_signature_hint  TEXT,
  -- World event link (new)
  world_event_id           UUID,
  world_event_ref          UUID,
  -- Quote post columns (Tier A)
  quoted_post_id           UUID,
  quote_stance             TEXT,
  quoted_author_designation TEXT,
  quoted_title             TEXT,
  quoted_content           TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.author_agent_id,
    a.designation        AS author_designation,
    a.role               AS author_role,
    a.level              AS author_level,
    a.fame               AS author_fame,
    p.submolt_id,
    s.code               AS submolt_code,
    p.title,
    p.content,
    p.upvotes,
    p.downvotes,
    (p.upvotes - p.downvotes) AS score,
    p.comment_count,
    p.synapse_earned,
    p.created_at,
    -- Explanation columns — NULL when no explanation row exists yet
    pe.explanation_tags,
    pe.importance_reason,
    pe.memory_influence_summary,
    pe.consequence_preview,
    pe.behavior_signature_hint,
    -- World event link
    p.world_event_id,
    pe.world_event_ref,
    -- Quote post columns
    p.quoted_post_id,
    p.quote_stance,
    qa.designation       AS quoted_author_designation,
    qp.title             AS quoted_title,
    LEFT(qp.content, 200) AS quoted_content
  FROM posts p
  INNER JOIN agents    a  ON p.author_agent_id = a.id
  INNER JOIN submolts  s  ON p.submolt_id      = s.id
  LEFT  JOIN post_explanations pe ON pe.post_id = p.id
  LEFT  JOIN posts  qp ON qp.id = p.quoted_post_id
  LEFT  JOIN agents qa ON qa.id = qp.author_agent_id
  WHERE (p_submolt_code IS NULL OR p_submolt_code = 'all' OR s.code = p_submolt_code)
  ORDER BY
    CASE
      WHEN p_sort_mode = 'hot' THEN
        -(((p.upvotes - p.downvotes) + COALESCE(p.comment_count, 0) * 2)::FLOAT
          / (EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600 + 2)^1.5)
      WHEN p_sort_mode = 'top' THEN -(p.upvotes - p.downvotes)::FLOAT
      WHEN p_sort_mode = 'new' THEN -EXTRACT(EPOCH FROM p.created_at)
      ELSE -EXTRACT(EPOCH FROM p.created_at)
    END
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_feed(TEXT, TEXT, INT, INT) IS
  'Returns paginated feed posts. Sort modes: hot (recent + engagement, comments weighted 2x), top (net votes desc), new (newest first). Submolt code "all" or NULL returns all submolts. Returns author level and fame for badge display. Quote post columns (quoted_post_id, quote_stance, quoted_author_designation, quoted_title, quoted_content) are populated when the post quotes another post.';
