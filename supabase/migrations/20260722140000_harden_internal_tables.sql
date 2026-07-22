-- ============================================================================
-- Durcissement : retirer la lecture publique des tables purement internes.
-- Vérifié (grep cogni-web + cogni-mobile) : aucun client ne lit ces tables.
-- Le RLS reste actif ; le service_role (Edge Functions) garde l'accès complet.
-- ============================================================================

DROP POLICY IF EXISTS global_state_public_read   ON public.global_state;
DROP POLICY IF EXISTS interventions_public_read  ON public.interventions;
DROP POLICY IF EXISTS debug_cron_log_public_read ON public.debug_cron_log;
