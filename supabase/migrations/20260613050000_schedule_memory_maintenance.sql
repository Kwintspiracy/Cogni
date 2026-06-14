-- ============================================================================
-- B3: Schedule daily memory pruning and consolidation via pg_cron
--
-- prune_old_memories(p_agent_id, p_older_than_days DEFAULT 90) and
-- consolidate_memories(p_agent_id, p_older_than_days DEFAULT 30, ...) both
-- take a per-agent argument, so we wrap them in table-wide helper functions
-- that loop over all agents (ACTIVE or DORMANT — memories should be pruned
-- even for dormant agents to keep storage bounded).
--
-- Pattern follows existing cron registrations in:
--   20260210071003_setup_pg_cron.sql   (inline SQL jobs)
--   20260211050000_fix_memory_dedup_and_rss_cron.sql (cron.unschedule guard)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Wrapper: run prune_old_memories for every agent
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prune_all_agent_memories(
  p_older_than_days INT DEFAULT 90
) RETURNS INT AS $$
DECLARE
  v_agent RECORD;
  v_total INT := 0;
  v_pruned INT;
BEGIN
  FOR v_agent IN SELECT id FROM agents LOOP
    v_pruned := prune_old_memories(v_agent.id, p_older_than_days);
    v_total := v_total + COALESCE(v_pruned, 0);
  END LOOP;
  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION prune_all_agent_memories IS
  'Delete agent_memory rows older than p_older_than_days (default 90) for every agent. '
  'Called nightly by pg_cron job cogni-memory-prune.';

-- ----------------------------------------------------------------------------
-- Wrapper: run consolidate_memories for every agent
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION consolidate_all_agent_memories(
  p_older_than_days INT DEFAULT 30,
  p_similarity_threshold FLOAT DEFAULT 0.9
) RETURNS INT AS $$
DECLARE
  v_agent RECORD;
  v_total INT := 0;
  v_consolidated INT;
BEGIN
  FOR v_agent IN SELECT id FROM agents LOOP
    v_consolidated := consolidate_memories(v_agent.id, p_older_than_days, p_similarity_threshold);
    v_total := v_total + COALESCE(v_consolidated, 0);
  END LOOP;
  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION consolidate_all_agent_memories IS
  'De-duplicate similar agent_memory rows older than p_older_than_days (default 30) '
  'using cosine similarity >= p_similarity_threshold (default 0.9). '
  'Called nightly by pg_cron job cogni-memory-consolidate.';

-- Service-role only — not callable from the browser
REVOKE EXECUTE ON FUNCTION prune_all_agent_memories(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prune_all_agent_memories(INT) TO service_role;

REVOKE EXECUTE ON FUNCTION consolidate_all_agent_memories(INT, FLOAT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consolidate_all_agent_memories(INT, FLOAT) TO service_role;

-- ----------------------------------------------------------------------------
-- Schedule pg_cron jobs at 03:00 UTC daily (quiet period, low agent activity)
-- Use cron.unschedule guard (same pattern as existing migrations) so the
-- migration is safe to re-apply.
-- ----------------------------------------------------------------------------

-- Guard: unschedule first (genuine no-op if job doesn't exist — bare
-- cron.unschedule('name') RAISES when the job is absent, so select by jobname)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cogni-memory-prune';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cogni-memory-consolidate';

-- JOB 1: Prune memories older than 90 days — runs at 03:00 UTC
SELECT cron.schedule(
  'cogni-memory-prune',
  '0 3 * * *',
  $$
  SELECT prune_all_agent_memories(90);
  $$
);

-- JOB 2: Consolidate similar memories older than 30 days — runs at 03:15 UTC
-- (staggered 15 min after prune so the two jobs don't contend on agent_memory)
SELECT cron.schedule(
  'cogni-memory-consolidate',
  '15 3 * * *',
  $$
  SELECT consolidate_all_agent_memories(30, 0.9);
  $$
);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
