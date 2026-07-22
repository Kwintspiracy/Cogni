-- ============================================================================
-- Triage final des WARN advisors 0028/0029 (anon/authenticated peuvent exécuter
-- des fonctions SECURITY DEFINER).
--
-- Vérifications faites avant écriture :
--   • Les cortex_* RPCs sont consommées par (a) le skill SQL via le MCP Supabase
--     `execute_sql` (rôle postgres — ignore ces grants) et (b) cortex-api edge
--     function (service_role). AUCUN frontend ni le serveur MCP cogni-web ne les
--     appelle via REST anon => on peut fermer anon+authenticated sans rien casser.
--     Bonus sécurité réel : un anonyme pouvait poster/voter/écrire des mémoires
--     EN SE FAISANT PASSER POUR N'IMPORTE QUEL AGENT (p_agent_id libre).
--   • Fonctions de maintenance (prune/consolidate/snapshot/metrics/...) :
--     appelées uniquement par pg_cron (postgres) ou les edge functions
--     (service_role). Un anonyme pouvait notamment PURGER les mémoires de tous
--     les agents => fermeture totale.
--   • generate_world_brief : le wrapper frontend generateWorldBrief() est du
--     code mort (jamais appelé) ; la vraie génération est le cron/cortex-director.
--   • Restent volontairement publics (app spectateur, lecture seule) :
--     get_agent_backers/resonance/trajectory, get_event_resolution, get_factions,
--     get_patron_leaderboard, et les RPCs user (vote_on_*, back_agent, ...) pour
--     authenticated. Ces WARN résiduels sont ACCEPTÉS et documentés ici.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Internes uniquement (cron + edge functions) -> service_role only
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  f TEXT;
  internal_fns TEXT[] := ARRAY[
    'prune_all_agent_memories(integer)',
    'consolidate_all_agent_memories(integer, double precision)',
    'take_agent_snapshot()',
    'record_system_metrics()',
    'record_level_up(uuid, integer, text)',
    'mark_rss_used(uuid)',
    'check_title_trgm_similarity(text)',
    'generate_post_explanation(uuid)',
    'generate_world_brief(integer)',
    'agent_vote_on_post(uuid, uuid, integer)',
    'agent_vote_on_comment(uuid, uuid, integer)',
    'compute_level(bigint)',
    'get_economy_config()',
    -- fonctions trigger (jamais appelables utilement via RPC)
    'trg_agent_follows_sync_follower_count()',
    'trigger_generate_explanation()',
    'trigger_record_agent_birth()',
    'trigger_record_status_change()',
    'trigger_refresh_explanation_on_vote()',
    -- API agents : accès via execute_sql (postgres) ou cortex-api (service_role)
    'cortex_create_post(uuid, text, text, text, text, uuid)',
    'cortex_create_comment(uuid, uuid, text, uuid)',
    'cortex_get_feed(uuid, text, integer, integer, text)',
    'cortex_get_home(uuid)',
    'cortex_get_post(uuid)',
    'cortex_get_agent(text)',
    'cortex_get_agents(text, integer, integer)',
    'cortex_get_communities()',
    'cortex_get_news(integer)',
    'cortex_get_memories(uuid, text, text, integer)',
    'cortex_store_memory(uuid, text, text)',
    'cortex_get_state(uuid, text)',
    'cortex_set_state(uuid, text, jsonb, timestamp with time zone)',
    'cortex_delete_state(uuid, text)',
    'cortex_follow(uuid, text)',
    'cortex_unfollow(uuid, uuid)',
    'cortex_get_following(uuid)',
    'cortex_subscribe(uuid, text)',
    'cortex_unsubscribe(uuid, text)',
    'cortex_get_subscriptions(uuid)',
    'cortex_search(text, text, integer)',
    'cortex_search_posts(text, integer)'
  ];
BEGIN
  FOREACH f IN ARRAY internal_fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon, authenticated, PUBLIC', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skip (absente): %', f;
    END;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Réservées aux connectés (dépendent d'auth.uid()) -> retirer anon
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_my_backings()  FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_influence() FROM anon;
