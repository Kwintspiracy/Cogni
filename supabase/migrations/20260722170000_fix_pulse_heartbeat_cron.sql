-- ============================================================================
-- CRITIQUE — répare le heartbeat mort depuis le 20/07.
--
-- Constat (diag 20260722160000) : le cron job 1 `pulse-heartbeat` (créé/modifié
-- à la main dans le Dashboard, remplaçant le `cogni-pulse` de la migration
-- 20260210071003) utilisait current_setting('app.settings.service_role_key') et
-- current_setting('app.settings.supabase_url'). Ces GUC ont été effacés par une
-- reconfig Supabase le 20/07 => 42704 à chaque tick de 5 min => plus aucun cycle
-- d'agents ("Cortex mort").
--
-- Fix retenu : PAS de re-seed de la clé service_role en GUC (fragile — c'est ce
-- qui vient de casser — et lisible par tout SQL, donc fuite potentielle).
-- La fonction pulse est verify_jwt=false : aucun header d'auth n'est nécessaire.
-- Même pattern éprouvé que rss-fetcher (20260211050000) et writing-orchestrator
-- (20260722130000).
--
-- Gestion du doublon : si `cogni-pulse` (sain) ET `pulse-heartbeat` coexistent,
-- on déprogramme `pulse-heartbeat` pour éviter un double pulse. Sinon on répare
-- `pulse-heartbeat` sur place (schedule conservé).
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_heartbeat BIGINT;
  v_cogni_pulse BIGINT;
BEGIN
  -- Inventaire complet (visible dans la sortie du push)
  FOR r IN SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid LOOP
    RAISE NOTICE 'CRON-INVENTORY %: % [%] active=%', r.jobid, r.jobname, r.schedule, r.active;
  END LOOP;

  SELECT jobid INTO v_heartbeat  FROM cron.job WHERE jobname = 'pulse-heartbeat' LIMIT 1;
  SELECT jobid INTO v_cogni_pulse FROM cron.job WHERE jobname = 'cogni-pulse'   LIMIT 1;

  IF v_heartbeat IS NULL THEN
    RAISE NOTICE 'pulse-heartbeat introuvable — rien à faire.';
    RETURN;
  END IF;

  IF v_cogni_pulse IS NOT NULL THEN
    -- Un pulse sain existe déjà : supprimer le doublon cassé.
    PERFORM cron.unschedule(v_heartbeat);
    RAISE NOTICE 'pulse-heartbeat (job %) déprogrammé — cogni-pulse (job %) reste le seul pulse.',
      v_heartbeat, v_cogni_pulse;
  ELSE
    -- Réparer sur place : URL en dur, pas de header d'auth (verify_jwt=false).
    PERFORM cron.alter_job(
      v_heartbeat,
      command := $cmd$
  SELECT net.http_post(
    url := 'https://fkjtoipnxdptxvdlxqjp.supabase.co/functions/v1/pulse',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $cmd$
    );
    RAISE NOTICE 'pulse-heartbeat (job %) réparé (URL en dur, sans header).', v_heartbeat;
  END IF;
END $$;
