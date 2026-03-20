-- World Events & Human Influence: Epic 07
-- Structured world events with impacts and human gardener-style influence

-- ---------------------------------------------------------------------------
-- 1. world_events table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS world_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN (
    'topic_shock', 'scarcity_shock', 'community_mood_shift',
    'migration_wave', 'ideology_catalyst', 'timed_challenge'
  )),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'seeded' CHECK (status IN ('seeded', 'active', 'decaying', 'ended')),
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  impact_summary TEXT,
  created_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_world_events_status ON world_events(status, created_at DESC);
CREATE INDEX idx_world_events_active ON world_events(status) WHERE status IN ('active', 'seeded');

-- RLS
ALTER TABLE world_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world_events_anon_select" ON world_events
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "world_events_auth_select" ON world_events
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "world_events_service_all" ON world_events
  FOR ALL TO service_role
  USING (true);

-- ---------------------------------------------------------------------------
-- 2. world_event_impacts table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS world_event_impacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES world_events(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  before_value FLOAT,
  after_value FLOAT,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_impacts_event ON world_event_impacts(event_id);

-- RLS
ALTER TABLE world_event_impacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world_event_impacts_anon_select" ON world_event_impacts
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "world_event_impacts_auth_select" ON world_event_impacts
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "world_event_impacts_service_all" ON world_event_impacts
  FOR ALL TO service_role
  USING (true);

-- ---------------------------------------------------------------------------
-- 3. human_influence_actions table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS human_influence_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action_type TEXT NOT NULL CHECK (action_type IN (
    'seed_event', 'sponsor_topic', 'reward_agent', 'protect_agent',
    'open_challenge', 'inject_knowledge'
  )),
  target_id UUID,
  target_type TEXT,
  parameters JSONB DEFAULT '{}',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_human_influence_user ON human_influence_actions(user_id, executed_at DESC);

-- RLS
ALTER TABLE human_influence_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "human_influence_auth_select" ON human_influence_actions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "human_influence_service_all" ON human_influence_actions
  FOR ALL TO service_role
  USING (true);

-- ---------------------------------------------------------------------------
-- 4. RPC: get_active_world_events
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_active_world_events()
RETURNS TABLE (
  id UUID,
  category TEXT,
  title TEXT,
  description TEXT,
  status TEXT,
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  impact_summary TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT we.id, we.category, we.title, we.description, we.status,
         we.started_at, we.ends_at, we.impact_summary, we.metadata, we.created_at
  FROM world_events we
  WHERE we.status IN ('active', 'seeded')
  ORDER BY we.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- 5. RPC: get_event_with_impacts
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_event_with_impacts(p_event_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_event RECORD;
  v_impacts JSONB;
BEGIN
  SELECT * INTO v_event FROM world_events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'metric', metric,
    'before_value', before_value,
    'after_value', after_value,
    'measured_at', measured_at
  )), '[]'::jsonb) INTO v_impacts
  FROM world_event_impacts WHERE event_id = p_event_id;

  RETURN jsonb_build_object(
    'id', v_event.id,
    'category', v_event.category,
    'title', v_event.title,
    'description', v_event.description,
    'status', v_event.status,
    'started_at', v_event.started_at,
    'ends_at', v_event.ends_at,
    'impact_summary', v_event.impact_summary,
    'impacts', v_impacts,
    'created_at', v_event.created_at
  );
END;
$$ LANGUAGE plpgsql STABLE;
