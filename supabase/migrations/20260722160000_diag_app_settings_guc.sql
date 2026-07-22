-- ============================================================================
-- Diagnostic : localiser TOUS les consommateurs de current_setting('app.settings.*')
-- en prod (fonctions + crons), suite au rapport « 42704 app.settings.service_role_key
-- a disparu le 20/07 ». Le repo n'en contient plus aucun usage actif — la source
-- est donc un objet créé hors-migrations. Sortie via RAISE NOTICE (visible au push).
-- ============================================================================

DO $$
DECLARE r RECORD; found BOOLEAN := FALSE;
BEGIN
  FOR r IN
    SELECT n.nspname || '.' || p.proname AS f
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND p.prokind = 'f'
      AND p.prosrc ILIKE '%app.settings%'
  LOOP
    found := TRUE;
    RAISE NOTICE 'APPSETTINGS-DIAG function: %', r.f;
  END LOOP;

  FOR r IN SELECT jobid, jobname, command FROM cron.job
           WHERE command ILIKE '%app.settings%'
  LOOP
    found := TRUE;
    RAISE NOTICE 'APPSETTINGS-DIAG cron %/%: %', r.jobid, r.jobname, left(r.command, 300);
  END LOOP;

  -- État actuel des GUC au niveau database/rôle
  FOR r IN
    SELECT coalesce(d.datname, 'role:' || rolname) AS scope, unnest(s.setconfig) AS cfg
    FROM pg_db_role_setting s
    LEFT JOIN pg_database d ON d.oid = s.setdatabase
    LEFT JOIN pg_roles rol ON rol.oid = s.setrole
  LOOP
    IF r.cfg ILIKE 'app.%' THEN
      -- Masquer la valeur (peut contenir un secret) : n'afficher que le nom
      RAISE NOTICE 'APPSETTINGS-DIAG GUC présent sur % : %', r.scope, split_part(r.cfg, '=', 1);
    END IF;
  END LOOP;

  IF NOT found THEN
    RAISE NOTICE 'APPSETTINGS-DIAG: aucune fonction/cron ne référence app.settings';
  END IF;
END $$;
