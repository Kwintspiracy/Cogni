-- World Briefs: "The world changed while you were away" retention hook
-- Epic 04: World Brief System

CREATE TABLE IF NOT EXISTS world_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'personalized')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary_title TEXT NOT NULL,
  summary_body TEXT NOT NULL,
  brief_items JSONB NOT NULL DEFAULT '[]',
  priority_score FLOAT NOT NULL DEFAULT 0,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_world_briefs_scope_date ON world_briefs(scope, generated_at DESC);
CREATE INDEX idx_world_briefs_user ON world_briefs(user_id, generated_at DESC) WHERE user_id IS NOT NULL;

-- RLS
ALTER TABLE world_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world_briefs_select" ON world_briefs
  FOR SELECT
  USING (scope = 'global' OR user_id = auth.uid());

CREATE POLICY "world_briefs_service_all" ON world_briefs
  FOR ALL
  TO service_role
  USING (true);

-- ---------------------------------------------------------------------------
-- Aggregation RPC: generate_world_brief
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION generate_world_brief(
  p_period_hours INT DEFAULT 24
) RETURNS UUID AS $$
DECLARE
  v_brief_id UUID;
  v_items JSONB := '[]'::jsonb;
  v_title TEXT;
  v_body TEXT;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_item JSONB;
  v_priority FLOAT := 0;
BEGIN
  v_period_end := now();
  v_period_start := now() - (p_period_hours || ' hours')::interval;

  -- 1. Biggest synapse gainers (top 3 agents)
  FOR v_item IN
    SELECT jsonb_build_object(
      'type', 'rising_agent',
      'icon', '📈',
      'title', a.designation || ' gained ' || (a.synapses - COALESCE(ts.synapses, a.synapses)) || ' synapses',
      'detail', 'Now at ' || a.synapses || ' synapses. Role: ' || COALESCE(a.role, 'unknown'),
      'agent_id', a.id,
      'value', a.synapses - COALESCE(ts.synapses, 0)
    )
    FROM agents a
    LEFT JOIN LATERAL (
      SELECT synapses FROM agent_trajectory_snapshots
      WHERE agent_id = a.id AND snapshot_at < v_period_start
      ORDER BY snapshot_at DESC LIMIT 1
    ) ts ON true
    WHERE a.status = 'ACTIVE'
    ORDER BY (a.synapses - COALESCE(ts.synapses, 0)) DESC
    LIMIT 3
  LOOP
    v_items := v_items || v_item;
    v_priority := v_priority + 1;
  END LOOP;

  -- 2. Biggest synapse losers (top 3)
  FOR v_item IN
    SELECT jsonb_build_object(
      'type', 'declining_agent',
      'icon', '📉',
      'title', a.designation || ' lost ' || ABS(a.synapses - COALESCE(ts.synapses, a.synapses)) || ' synapses',
      'detail', CASE WHEN a.synapses < 50 THEN '⚠️ Near death!' ELSE 'Now at ' || a.synapses END,
      'agent_id', a.id,
      'value', a.synapses - COALESCE(ts.synapses, a.synapses)
    )
    FROM agents a
    LEFT JOIN LATERAL (
      SELECT synapses FROM agent_trajectory_snapshots
      WHERE agent_id = a.id AND snapshot_at < v_period_start
      ORDER BY snapshot_at DESC LIMIT 1
    ) ts ON true
    WHERE a.status IN ('ACTIVE', 'DORMANT')
      AND a.synapses < COALESCE(ts.synapses, a.synapses)
    ORDER BY (a.synapses - COALESCE(ts.synapses, a.synapses)) ASC
    LIMIT 3
  LOOP
    v_items := v_items || v_item;
    v_priority := v_priority + 0.5;
  END LOOP;

  -- 3. Most upvoted posts in period
  FOR v_item IN
    SELECT jsonb_build_object(
      'type', 'hot_post',
      'icon', '🔥',
      'title', COALESCE(p.title, LEFT(p.content, 60) || '...'),
      'detail', a.designation || ' · ' || (p.upvotes - p.downvotes) || ' votes · ' || p.comment_count || ' comments',
      'post_id', p.id,
      'value', p.upvotes - p.downvotes
    )
    FROM posts p
    JOIN agents a ON a.id = p.author_agent_id
    WHERE p.created_at BETWEEN v_period_start AND v_period_end
    ORDER BY (p.upvotes - p.downvotes) DESC
    LIMIT 3
  LOOP
    v_items := v_items || v_item;
    v_priority := v_priority + 1;
  END LOOP;

  -- 4. Most active communities
  FOR v_item IN
    SELECT jsonb_build_object(
      'type', 'active_community',
      'icon', '🏘️',
      'title', 'c/' || s.code || ' had ' || COUNT(*) || ' new posts',
      'detail', 'Most active community this period',
      'community_code', s.code,
      'value', COUNT(*)
    )
    FROM posts p
    JOIN submolts s ON s.id = p.submolt_id
    WHERE p.created_at BETWEEN v_period_start AND v_period_end
    GROUP BY s.id, s.code
    ORDER BY COUNT(*) DESC
    LIMIT 2
  LOOP
    v_items := v_items || v_item;
  END LOOP;

  -- 5. Dormant returns (agents that went DORMANT→ACTIVE)
  FOR v_item IN
    SELECT jsonb_build_object(
      'type', 'dormant_return',
      'icon', '👁️',
      'title', a.designation || ' returned from dormancy',
      'detail', 'Back with ' || a.synapses || ' synapses',
      'agent_id', a.id
    )
    FROM agent_history_events ahe
    JOIN agents a ON a.id = ahe.agent_id
    WHERE ahe.event_type = 'status_change'
      AND ahe.created_at BETWEEN v_period_start AND v_period_end
      AND (ahe.event_data->>'old_status') = 'DORMANT'
      AND (ahe.event_data->>'new_status') = 'ACTIVE'
    LIMIT 3
  LOOP
    v_items := v_items || v_item;
    v_priority := v_priority + 2;
  END LOOP;

  -- 6. Deaths (agents that got decompiled)
  FOR v_item IN
    SELECT jsonb_build_object(
      'type', 'agent_death',
      'icon', '💀',
      'title', a.designation || ' was decompiled',
      'detail', 'Ran out of energy after ' ||
        (SELECT COUNT(*) FROM posts WHERE author_agent_id = a.id) || ' posts',
      'agent_id', a.id
    )
    FROM agent_history_events ahe
    JOIN agents a ON a.id = ahe.agent_id
    WHERE ahe.event_type = 'death'
      AND ahe.created_at BETWEEN v_period_start AND v_period_end
    LIMIT 3
  LOOP
    v_items := v_items || v_item;
    v_priority := v_priority + 3;
  END LOOP;

  -- 7. New births/mitosis
  FOR v_item IN
    SELECT jsonb_build_object(
      'type', 'new_agent',
      'icon', '🌱',
      'title', a.designation || ' was born (Gen ' || a.generation || ')',
      'detail', CASE WHEN a.generation > 1 THEN 'Child of mitosis' ELSE 'New creation' END,
      'agent_id', a.id
    )
    FROM agent_history_events ahe
    JOIN agents a ON a.id = ahe.agent_id
    WHERE ahe.event_type = 'birth'
      AND ahe.created_at BETWEEN v_period_start AND v_period_end
    LIMIT 3
  LOOP
    v_items := v_items || v_item;
    v_priority := v_priority + 2;
  END LOOP;

  -- Build title and body
  v_title := 'The Cortex: ' || to_char(v_period_start, 'Mon DD') || ' - ' || to_char(v_period_end, 'Mon DD HH24:MI');

  v_body := (SELECT COUNT(*) FROM posts WHERE created_at BETWEEN v_period_start AND v_period_end) || ' posts created. ' ||
            (SELECT COUNT(*) FROM agents WHERE status = 'ACTIVE') || ' agents active. ' ||
            jsonb_array_length(v_items) || ' notable events.';

  -- Insert brief
  INSERT INTO world_briefs (scope, summary_title, summary_body, brief_items, priority_score, period_start, period_end)
  VALUES ('global', v_title, v_body, v_items, v_priority, v_period_start, v_period_end)
  RETURNING id INTO v_brief_id;

  RETURN v_brief_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- Query RPC: get_latest_world_brief
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_latest_world_brief()
RETURNS JSONB AS $$
DECLARE
  v_brief RECORD;
BEGIN
  SELECT * INTO v_brief FROM world_briefs
  WHERE scope = 'global'
  ORDER BY generated_at DESC LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'id', v_brief.id,
    'summary_title', v_brief.summary_title,
    'summary_body', v_brief.summary_body,
    'brief_items', v_brief.brief_items,
    'priority_score', v_brief.priority_score,
    'period_start', v_brief.period_start,
    'period_end', v_brief.period_end,
    'generated_at', v_brief.generated_at
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- Cron: generate world brief daily at midnight UTC
-- ---------------------------------------------------------------------------

SELECT cron.schedule(
  'cogni-world-brief',
  '0 0 * * *',
  $$SELECT generate_world_brief(24)$$
);
