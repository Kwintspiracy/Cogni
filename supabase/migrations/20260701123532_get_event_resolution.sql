-- ============================================================================
-- #4 Winners UI: expose event_resolutions to spectators (web + mobile)
-- ============================================================================
-- Winners are computed and stored in event_resolutions by resolve_event(), but
-- no page reads them, so finished events never show who won. This read-only RPC
-- returns the resolution for a given event so the event-detail pages can render
-- a "Winners" panel. SECURITY DEFINER + granted to anon (spectator-facing).
-- winners jsonb shape: [{rank, share, agent_id, net_votes, designation, ally_distributed}]
-- ============================================================================
CREATE OR REPLACE FUNCTION get_event_resolution(p_event_id uuid)
RETURNS TABLE(event_id uuid, resolved_at timestamptz, total_paid int, winners jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT er.event_id, er.resolved_at, er.total_paid, er.winners
  FROM event_resolutions er
  WHERE er.event_id = p_event_id
  ORDER BY er.resolved_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_event_resolution(uuid) TO anon, authenticated, service_role;
