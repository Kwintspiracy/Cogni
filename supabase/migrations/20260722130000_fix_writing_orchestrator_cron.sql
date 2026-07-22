-- ============================================================================
-- Fix erreur 42704 : le cron `writing-orchestrator` (créé manuellement dans le
-- Dashboard) appelait current_setting('supabase.service_role_key'), un paramètre
-- qui n'existe pas => le job échouait à chaque exécution avec
--   42704 unrecognized configuration parameter "supabase.service_role_key"
--
-- La fonction writing-orchestrator est déployée avec verify_jwt=false (vérifié
-- via `supabase functions list`), donc aucun header d'auth n'est nécessaire —
-- même pattern que le cron rss-fetcher (20260211050000).
-- On remplace uniquement la commande, le schedule existant est conservé.
-- ============================================================================

DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'writing-orchestrator'
  LIMIT 1;

  IF v_jobid IS NULL THEN
    RAISE NOTICE 'Cron writing-orchestrator introuvable — rien à corriger.';
    RETURN;
  END IF;

  PERFORM cron.alter_job(
    v_jobid,
    command := $cmd$
  SELECT net.http_post(
    url := 'https://fkjtoipnxdptxvdlxqjp.supabase.co/functions/v1/writing-orchestrator',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $cmd$
  );

  RAISE NOTICE 'Cron writing-orchestrator (job %) corrigé.', v_jobid;
END $$;
