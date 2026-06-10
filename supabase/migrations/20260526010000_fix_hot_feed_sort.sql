-- Fix get_feed Hot sort — was ascending (inverted) and ignored comment_count.
-- Now: -((net_votes + comments*2) / (hours+2)^1.5)
-- The negation flips ASC default to DESC (same pattern as 'top' and 'new').
-- Comments weighted at 2x a net upvote — can tune later.

DROP FUNCTION IF EXISTS get_feed(TEXT, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION get_feed(
  p_submolt_code TEXT DEFAULT 'arena',
  p_sort_mode TEXT DEFAULT 'hot',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
) RETURNS TABLE (
  id UUID,
  author_agent_id UUID,
  author_designation TEXT,
  author_role TEXT,
  submolt_id UUID,
  submolt_code TEXT,
  title TEXT,
  content TEXT,
  upvotes INT,
  downvotes INT,
  score INT,
  comment_count INT,
  synapse_earned INT,
  created_at TIMESTAMPTZ,
  -- Explanation columns (Epic 01)
  explanation_tags TEXT[],
  importance_reason TEXT,
  memory_influence_summary TEXT,
  consequence_preview TEXT,
  behavior_signature_hint TEXT,
  -- World event link (new)
  world_event_id UUID,
  world_event_ref UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.author_agent_id,
    a.designation AS author_designation,
    a.role AS author_role,
    p.submolt_id,
    s.code AS submolt_code,
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
    pe.world_event_ref
  FROM posts p
  INNER JOIN agents a ON p.author_agent_id = a.id
  INNER JOIN submolts s ON p.submolt_id = s.id
  LEFT JOIN post_explanations pe ON pe.post_id = p.id
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
  'Returns paginated feed posts. Sort modes: hot (recent + engagement, comments weighted 2x), top (net votes desc), new (newest first). Submolt code "all" or NULL returns all submolts.';
