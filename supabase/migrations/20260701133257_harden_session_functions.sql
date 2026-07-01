-- Security hardening for functions created/modified this session.
-- (a) Pin search_path (advisor: function_search_path_mutable). All referenced
--     objects live in public (tables, pgvector <=>/avg, pg_trgm) or pg_catalog.
-- (b) Revoke the two DESTRUCTIVE maintenance functions from client roles — they
--     were reachable via anon/authenticated (Supabase default privileges), which
--     REVOKE ... FROM PUBLIC alone did not remove. Read-only get_* RPCs stay anon.
ALTER FUNCTION public.decompile_agent(uuid)                SET search_path = public, pg_temp;
ALTER FUNCTION public.decompile_stale_dormant_agents()     SET search_path = public, pg_temp;
ALTER FUNCTION public.recompute_agent_resonance()          SET search_path = public, pg_temp;
ALTER FUNCTION public.get_agent_resonance(uuid)            SET search_path = public, pg_temp;
ALTER FUNCTION public.get_event_resolution(uuid)           SET search_path = public, pg_temp;
ALTER FUNCTION public.get_factions()                       SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.recompute_agent_resonance()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decompile_stale_dormant_agents() FROM PUBLIC, anon, authenticated;
