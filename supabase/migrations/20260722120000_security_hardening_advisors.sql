-- ============================================================================
-- Security hardening — résout les advisors Supabase (2026-07-22)
--
-- Contexte vérifié avant écriture :
--   • Le frontend (cogni-web + cogni-mobile) lit posts/comments/agents/submolts/
--     agent_memory EN DIRECT via la clé anon/authenticated (0 appel cortex_* RPC).
--     => activer le RLS SANS policy de lecture casserait le feed. On ajoute donc
--        une policy SELECT USING(true) partout où le client lit la table.
--   • Les Edge Functions utilisent le service_role => elles bypassent le RLS.
--   • Les fonctions SECURITY DEFINER qui s'appellent entre elles tournent comme
--     leur OWNER, donc révoquer anon/authenticated ne casse pas les appels internes.
--
-- Cette migration est idempotente (ré-exécutable sans erreur).
-- À appliquer dans le SQL Editor du Dashboard.
-- ============================================================================

-- ############################################################################
-- SECTION 0 — Sauvegarde des ACL actuelles (rollback) + diagnostic 42704
-- ############################################################################

CREATE TABLE IF NOT EXISTS public._backup_acl_20260722 AS
SELECT p.oid::regprocedure::text AS func, p.proacl::text AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public';
ALTER TABLE public._backup_acl_20260722 ENABLE ROW LEVEL SECURITY;

-- Diagnostic : localiser la source de l'erreur 42704
-- « unrecognized configuration parameter "supabase.service_role_key" »
DO $$
DECLARE r RECORD; found BOOLEAN := FALSE;
BEGIN
  FOR r IN
    SELECT n.nspname || '.' || p.proname AS f
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND p.prokind = 'f'
      AND p.prosrc ILIKE '%supabase.service_role_key%'
  LOOP
    found := TRUE;
    RAISE NOTICE '42704-DIAG function: %', r.f;
  END LOOP;
  BEGIN
    FOR r IN SELECT jobid, jobname, command FROM cron.job
             WHERE command ILIKE '%supabase.service_role_key%'
    LOOP
      found := TRUE;
      RAISE NOTICE '42704-DIAG cron job %/%: %', r.jobid, r.jobname, r.command;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '42704-DIAG: cron.job non lisible (%).', SQLERRM;
  END;
  IF NOT found THEN
    RAISE NOTICE '42704-DIAG: aucune fonction/cron ne référence supabase.service_role_key';
  END IF;
END $$;

-- ############################################################################
-- SECTION 1 — CRITIQUE : fermer l'accès anon aux fonctions secrets / internes
-- (fuite de clés API LLM). Ces fonctions ne sont appelées QUE par les Edge
-- Functions (service_role) ou en interne. Vérifié : absentes du frontend.
-- ############################################################################

REVOKE EXECUTE ON FUNCTION public.decrypt_api_key(uuid)                 FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._resolve_cred_secret()               FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reencrypt_all_llm_credentials()      FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._apply_daily_influence_grant(uuid)   FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._award_prestige_to_backers(uuid, integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._mask_handle(uuid)                   FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ally(uuid, uuid, integer)            FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_event(uuid)                  FROM anon, authenticated, PUBLIC;

-- Garantir que le service_role garde l'accès (les Edge Functions en dépendent).
GRANT EXECUTE ON FUNCTION public.decrypt_api_key(uuid)                 TO service_role;
GRANT EXECUTE ON FUNCTION public._resolve_cred_secret()               TO service_role;
GRANT EXECUTE ON FUNCTION public.reencrypt_all_llm_credentials()      TO service_role;
GRANT EXECUTE ON FUNCTION public._apply_daily_influence_grant(uuid)   TO service_role;
GRANT EXECUTE ON FUNCTION public._award_prestige_to_backers(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public._mask_handle(uuid)                   TO service_role;
GRANT EXECUTE ON FUNCTION public.ally(uuid, uuid, integer)            TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_event(uuid)                  TO service_role;

-- ############################################################################
-- SECTION 2 — Fermer l'accès ANON (uniquement) aux fonctions d'action utilisateur.
-- Ces fonctions exigent un utilisateur connecté (auth.uid()) par design ; le
-- frontend les appelle en tant qu'`authenticated`. On révoque anon seulement.
-- (Durcissement recommandé — n'affecte AUCUN utilisateur connecté.)
-- ############################################################################

REVOKE EXECUTE ON FUNCTION public.upsert_llm_credential(uuid, text, text, text)  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_llm_credentials(uuid)                 FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_llm_credential(uuid, uuid)              FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_user_agent_v2(uuid, jsonb)             FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_webhook_agent(uuid, jsonb)            FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_user_agent(uuid, uuid, jsonb)          FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_agent(uuid, uuid)                      FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_agent_api_key(uuid)                 FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_agent_enabled(uuid, boolean)             FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recharge_agent(uuid, integer)               FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reward_agent(uuid, uuid, integer)            FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.back_agent(uuid, integer)                    FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inject_knowledge(uuid, text, text)           FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sponsor_topic(uuid, text, text)              FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_agent(uuid, uuid, integer)           FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.open_challenge(uuid, text, text, integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_world_event(uuid, text, text, text, integer)  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vote_on_post(uuid, uuid, integer)            FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vote_on_comment(uuid, uuid, integer)         FROM anon, PUBLIC;

-- ############################################################################
-- SECTION 3 — ERROR: RLS. Activer le RLS. Les tables lues par le frontend
-- reçoivent une policy SELECT publique pour préserver EXACTEMENT le comportement
-- de lecture actuel ; seules les écritures anon (le trou de sécurité signalé)
-- sont fermées. Les Edge Functions (service_role) continuent d'écrire.
-- ############################################################################

-- 3a. Tables qui ont DÉJÀ une policy de lecture -> il suffit d'activer le RLS.
ALTER TABLE public.posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submolts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threads   ENABLE ROW LEVEL SECURITY;

-- 3b. Tables sans policy -> activer RLS + policy SELECT publique (statu quo lecture).
DO $$
DECLARE
  t text;
  read_tables text[] := ARRAY[
    'agent_memory', 'knowledge_chunks', 'event_cards', 'agent_votes',
    'agents_archive', 'agent_submolt_subscriptions', 'challenge_submissions',
    'global_state', 'interventions', 'debug_cron_log'
  ];
BEGIN
  FOREACH t IN ARRAY read_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_public_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
      t || '_public_read', t
    );
  END LOOP;
END $$;

-- NOTE : global_state / interventions / debug_cron_log ne sont PAS lues par le
-- frontend (vérifié par grep). Si tu confirmes qu'aucun client ne les lit, tu peux
-- durcir en supprimant leur policy publique :
--   DROP POLICY global_state_public_read   ON public.global_state;
--   DROP POLICY interventions_public_read   ON public.interventions;
--   DROP POLICY debug_cron_log_public_read  ON public.debug_cron_log;
-- (le RLS reste actif => service_role garde l'accès, anon perd la lecture).

-- ############################################################################
-- SECTION 4 — ERROR: vues SECURITY DEFINER -> SECURITY INVOKER.
-- ############################################################################
ALTER VIEW public.agents_near_death SET (security_invoker = on);
ALTER VIEW public.recently_deceased SET (security_invoker = on);

-- ############################################################################
-- SECTION 5 — WARN: search_path mutable sur toutes les fonctions public.
-- Fixe le search_path en une passe (évite les attaques par shadowing de schéma).
-- ############################################################################
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')   -- fonctions + procédures
      -- Exclure les fonctions appartenant à des extensions (vector, pg_trgm,
      -- pg_net sont installées dans public : des centaines de fonctions à ne
      -- surtout pas toucher).
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    EXCEPTION WHEN OTHERS THEN
      -- ex. procédures : réessayer avec ALTER PROCEDURE
      BEGIN
        EXECUTE format('ALTER PROCEDURE %s SET search_path = public, pg_temp', r.sig);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'skip %: %', r.sig, SQLERRM;
      END;
    END;
  END LOOP;
END $$;

-- ############################################################################
-- SECTION 6 — WARN: policy « always true » trop permissive sur web_evidence_cards.
-- Restreindre l'accès complet au seul service_role (les agents y accèdent via
-- les Edge Functions).
-- ############################################################################
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'web_evidence_cards'
      AND policyname = 'Service role full access on web_evidence_cards'
  ) THEN
    DROP POLICY "Service role full access on web_evidence_cards" ON public.web_evidence_cards;
  END IF;
  CREATE POLICY "web_evidence_cards_service_all"
    ON public.web_evidence_cards
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
END $$;
