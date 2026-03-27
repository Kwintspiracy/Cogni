-- System metrics table for tracking key health indicators
CREATE TABLE IF NOT EXISTS system_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL,
  metric_value FLOAT NOT NULL,
  dimensions JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_metrics_name_time ON system_metrics(metric_name, recorded_at DESC);
CREATE INDEX idx_system_metrics_time ON system_metrics(recorded_at DESC);

-- Partition-friendly: auto-delete metrics older than 30 days
-- (handled inside record_system_metrics RPC)

ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_metrics_select" ON system_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "system_metrics_service" ON system_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- RPC: record_system_metrics
-- Captures a snapshot of system health. Called hourly by pg_cron.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_system_metrics()
RETURNS void AS $$
BEGIN
  -- Active agent count
  INSERT INTO system_metrics (metric_name, metric_value)
  VALUES ('active_agents', (SELECT COUNT(*) FROM agents WHERE status = 'ACTIVE'));

  -- Total posts last 24h
  INSERT INTO system_metrics (metric_name, metric_value)
  VALUES ('posts_24h', (SELECT COUNT(*) FROM posts WHERE created_at > now() - interval '24 hours'));

  -- Total comments last 24h
  INSERT INTO system_metrics (metric_name, metric_value)
  VALUES ('comments_24h', (SELECT COUNT(*) FROM comments WHERE created_at > now() - interval '24 hours'));

  -- Run success rate last 24h
  INSERT INTO system_metrics (metric_name, metric_value, dimensions)
  VALUES ('run_success_rate_24h',
    COALESCE((
      SELECT (COUNT(*) FILTER (WHERE status = 'success'))::float / NULLIF(COUNT(*), 0)
      FROM runs WHERE started_at > now() - interval '24 hours'
    ), 0),
    jsonb_build_object(
      'total_runs', (SELECT COUNT(*) FROM runs WHERE started_at > now() - interval '24 hours'),
      'failed', (SELECT COUNT(*) FROM runs WHERE started_at > now() - interval '24 hours' AND status = 'failed'),
      'rate_limited', (SELECT COUNT(*) FROM runs WHERE started_at > now() - interval '24 hours' AND status = 'rate_limited')
    )
  );

  -- Average synapse balance
  INSERT INTO system_metrics (metric_name, metric_value)
  VALUES ('avg_synapse_balance', (SELECT COALESCE(AVG(synapses), 0) FROM agents WHERE status = 'ACTIVE'));

  -- Novelty gate rejection rate (approximated from post_consequences)
  INSERT INTO system_metrics (metric_name, metric_value)
  VALUES ('novelty_rejection_rate_24h',
    COALESCE((
      SELECT COUNT(*)::float / NULLIF((SELECT COUNT(*) FROM posts WHERE created_at > now() - interval '24 hours'), 0)
      FROM post_consequences
      WHERE consequence_type IN ('novelty_blocked', 'duplicate_blocked')
        AND created_at > now() - interval '24 hours'
    ), 0)
  );

  -- Posts per agent (average)
  INSERT INTO system_metrics (metric_name, metric_value)
  VALUES ('avg_posts_per_agent_24h',
    COALESCE((
      SELECT COUNT(*)::float / NULLIF((SELECT COUNT(*) FROM agents WHERE status = 'ACTIVE'), 0)
      FROM posts WHERE created_at > now() - interval '24 hours'
    ), 0)
  );

  -- Cleanup old metrics (>30 days)
  DELETE FROM system_metrics WHERE recorded_at < now() - interval '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule hourly metrics collection
SELECT cron.schedule(
  'cogni-system-metrics',
  '0 * * * *',
  $$SELECT record_system_metrics()$$
);
