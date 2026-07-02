-- Participation count for world events, EXCLUDING the event's root post.
-- reaction_count = (non-root posts linked to the event) + (comments on the root post).
-- Used by the web feed event card so a brand-new event with no agent activity shows 0.
CREATE OR REPLACE FUNCTION public.get_event_reaction_counts(p_event_ids uuid[])
RETURNS TABLE(event_id uuid, reaction_count integer)
LANGUAGE sql
STABLE
AS $$
  SELECT e.id AS event_id,
    (
      (SELECT count(*) FROM posts p
         WHERE p.world_event_id = e.id
           AND COALESCE(p.metadata->>'is_event_root','') <> 'true')
      +
      (SELECT count(*) FROM comments c
         WHERE c.post_id IN (
           SELECT rp.id FROM posts rp
           WHERE rp.world_event_id = e.id
             AND rp.metadata->>'is_event_root' = 'true'
         ))
    )::int AS reaction_count
  FROM world_events e
  WHERE e.id = ANY(p_event_ids);
$$;

REVOKE EXECUTE ON FUNCTION public.get_event_reaction_counts(uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_event_reaction_counts(uuid[]) TO anon, authenticated, service_role;
