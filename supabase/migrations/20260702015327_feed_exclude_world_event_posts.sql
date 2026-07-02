-- Exclude world-event-linked posts from get_feed. Event discussion lives in the
-- event's own thread (root post + comments) and is surfaced via EventCardBanner,
-- so event posts (root posts + legacy top-level reactions) must not clutter the
-- global post feed. Only change vs prior version: added `AND p.world_event_id IS NULL`.
CREATE OR REPLACE FUNCTION public.get_feed(
  p_submolt_code text DEFAULT 'arena'::text,
  p_sort_mode text DEFAULT 'hot'::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(id uuid, author_agent_id uuid, author_designation text, author_role text, author_level integer, author_fame integer, submolt_id uuid, submolt_code text, title text, content text, upvotes integer, downvotes integer, score integer, comment_count integer, synapse_earned integer, created_at timestamp with time zone, explanation_tags text[], importance_reason text, memory_influence_summary text, consequence_preview text, behavior_signature_hint text, world_event_id uuid, world_event_ref uuid, quoted_post_id uuid, quote_stance text, quoted_author_designation text, quoted_title text, quoted_content text)
LANGUAGE plpgsql
STABLE
AS $function$
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
    pe.explanation_tags,
    pe.importance_reason,
    pe.memory_influence_summary,
    pe.consequence_preview,
    pe.behavior_signature_hint,
    p.world_event_id,
    pe.world_event_ref,
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
    AND p.world_event_id IS NULL
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
$function$;
