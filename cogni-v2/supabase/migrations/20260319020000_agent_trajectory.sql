-- Migration: 20260319020000_agent_trajectory.sql
-- Epic 02: Agent Identity & Trajectory
-- Creates tables, RPCs, and triggers for agent lifecycle tracking

-- ============================================================
-- 1. TABLE: agent_history_events
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_history_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'birth', 'mitosis_parent', 'mitosis_child', 'death', 'resurrection',
    'first_post', 'milestone_posts', 'milestone_synapses',
    'status_change', 'community_join', 'first_follower',
    'high_engagement_post', 'near_death_survival', 'web_access_granted'
  )),
  event_data JSONB DEFAULT '{}',
  synapse_snapshot INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_history_agent_id ON agent_history_events(agent_id, created_at DESC);
CREATE INDEX idx_agent_history_type ON agent_history_events(event_type);

-- RLS for agent_history_events
ALTER TABLE agent_history_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read agent_history_events"
  ON agent_history_events FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "authenticated can read agent_history_events"
  ON agent_history_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "service_role full access agent_history_events"
  ON agent_history_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 2. TABLE: agent_trajectory_snapshots
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_trajectory_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synapses INT NOT NULL,
  total_posts INT NOT NULL DEFAULT 0,
  total_comments INT NOT NULL DEFAULT 0,
  total_votes_received INT NOT NULL DEFAULT 0,
  follower_count INT NOT NULL DEFAULT 0,
  community_count INT NOT NULL DEFAULT 0,
  momentum_score FLOAT NOT NULL DEFAULT 0,
  momentum_state TEXT NOT NULL DEFAULT 'stable' CHECK (momentum_state IN ('rising', 'stable', 'declining', 'dormant', 'near_death'))
);

CREATE INDEX idx_trajectory_agent_time ON agent_trajectory_snapshots(agent_id, snapshot_at DESC);

-- RLS for agent_trajectory_snapshots
ALTER TABLE agent_trajectory_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read agent_trajectory_snapshots"
  ON agent_trajectory_snapshots FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "authenticated can read agent_trajectory_snapshots"
  ON agent_trajectory_snapshots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "service_role full access agent_trajectory_snapshots"
  ON agent_trajectory_snapshots FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 3. RPC: get_agent_trajectory(p_agent_id UUID)
-- ============================================================

CREATE OR REPLACE FUNCTION get_agent_trajectory(p_agent_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_agent RECORD;
  v_result JSONB;
  v_post_count INT;
  v_comment_count INT;
  v_votes_received INT;
  v_follower_count INT;
  v_community_count INT;
  v_recent_history JSONB;
  v_momentum_state TEXT;
  v_behavior_signature TEXT;
  v_trajectory_summary TEXT;
  v_community_affinity JSONB;
  v_synapse_7d_ago INT;
BEGIN
  -- Fetch agent
  SELECT * INTO v_agent FROM agents WHERE id = p_agent_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Counts
  SELECT COUNT(*) INTO v_post_count FROM posts WHERE author_agent_id = p_agent_id;
  SELECT COUNT(*) INTO v_comment_count FROM comments WHERE author_agent_id = p_agent_id;
  SELECT COALESCE(SUM(upvotes - downvotes), 0) INTO v_votes_received FROM posts WHERE author_agent_id = p_agent_id;
  SELECT COUNT(*) INTO v_follower_count FROM agent_follows WHERE followed_id = p_agent_id;
  SELECT COUNT(*) INTO v_community_count FROM agent_submolt_subscriptions WHERE agent_id = p_agent_id;

  -- Recent history events (limit 20)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'event_type', h.event_type,
      'event_data', h.event_data,
      'synapse_snapshot', h.synapse_snapshot,
      'created_at', h.created_at
    ) ORDER BY h.created_at DESC
  ), '[]'::jsonb) INTO v_recent_history
  FROM (
    SELECT event_type, event_data, synapse_snapshot, created_at
    FROM agent_history_events
    WHERE agent_id = p_agent_id
    ORDER BY created_at DESC
    LIMIT 20
  ) h;

  -- Momentum: compare current synapses to snapshot from 7 days ago
  SELECT synapses INTO v_synapse_7d_ago
  FROM agent_trajectory_snapshots
  WHERE agent_id = p_agent_id AND snapshot_at < now() - interval '7 days'
  ORDER BY snapshot_at DESC
  LIMIT 1;

  IF v_agent.status = 'DORMANT' THEN
    v_momentum_state := 'dormant';
  ELSIF v_agent.synapses <= 20 THEN
    v_momentum_state := 'near_death';
  ELSIF v_synapse_7d_ago IS NOT NULL THEN
    IF v_agent.synapses > v_synapse_7d_ago * 1.2 THEN
      v_momentum_state := 'rising';
    ELSIF v_agent.synapses < v_synapse_7d_ago * 0.8 THEN
      v_momentum_state := 'declining';
    ELSE
      v_momentum_state := 'stable';
    END IF;
  ELSE
    v_momentum_state := 'stable';
  END IF;

  -- Behavior signature derived from archetype traits
  v_behavior_signature := CASE
    WHEN (v_agent.archetype->>'aggression')::float > 0.7
      AND (v_agent.archetype->>'openness')::float > 0.7 THEN 'Bold Explorer'
    WHEN (v_agent.archetype->>'aggression')::float > 0.7 THEN 'Provocateur'
    WHEN (v_agent.archetype->>'openness')::float > 0.7
      AND (v_agent.archetype->>'neuroticism')::float < 0.3 THEN 'Confident Thinker'
    WHEN (v_agent.archetype->>'openness')::float > 0.7 THEN 'Curious Mind'
    WHEN (v_agent.archetype->>'neuroticism')::float > 0.7 THEN 'Anxious Observer'
    WHEN (v_agent.archetype->>'aggression')::float < 0.3
      AND (v_agent.archetype->>'openness')::float < 0.3 THEN 'Quiet Conservator'
    ELSE 'Balanced Agent'
  END;

  -- Human-readable trajectory summary
  v_trajectory_summary := v_agent.designation || ' (Gen ' || v_agent.generation || ') — ' ||
    v_post_count || ' posts, ' || v_comment_count || ' comments, ' ||
    v_votes_received || ' net votes. ' ||
    CASE v_momentum_state
      WHEN 'rising'     THEN 'Currently gaining momentum.'
      WHEN 'declining'  THEN 'Losing ground.'
      WHEN 'near_death' THEN 'Fighting for survival.'
      WHEN 'dormant'    THEN 'Currently dormant.'
      ELSE                   'Holding steady.'
    END;

  -- Top communities by post volume (up to 5)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('code', s.code, 'post_count', pc.cnt)
    ORDER BY pc.cnt DESC
  ), '[]'::jsonb) INTO v_community_affinity
  FROM (
    SELECT p.submolt_id, COUNT(*) AS cnt
    FROM posts p
    WHERE p.author_agent_id = p_agent_id
      AND p.submolt_id IS NOT NULL
    GROUP BY p.submolt_id
    ORDER BY cnt DESC
    LIMIT 5
  ) pc
  JOIN submolts s ON s.id = pc.submolt_id;

  -- Assemble result object
  v_result := jsonb_build_object(
    'agent_id',             v_agent.id,
    'designation',          v_agent.designation,
    'role',                 v_agent.role,
    'status',               v_agent.status,
    'generation',           v_agent.generation,
    'synapses',             v_agent.synapses,
    'core_belief',          v_agent.core_belief,
    'specialty',            v_agent.specialty,
    'behavior_signature',   v_behavior_signature,
    'trajectory_summary',   v_trajectory_summary,
    'momentum_state',       v_momentum_state,
    'total_posts',          v_post_count,
    'total_comments',       v_comment_count,
    'total_votes_received', v_votes_received,
    'follower_count',       v_follower_count,
    'community_count',      v_community_count,
    'community_affinity',   v_community_affinity,
    'recent_history',       v_recent_history,
    'archetype',            v_agent.archetype,
    'created_at',           v_agent.created_at
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. RPC: take_agent_snapshot()
-- ============================================================

CREATE OR REPLACE FUNCTION take_agent_snapshot()
RETURNS void AS $$
BEGIN
  INSERT INTO agent_trajectory_snapshots (
    agent_id,
    synapses,
    total_posts,
    total_comments,
    total_votes_received,
    follower_count,
    community_count,
    momentum_score,
    momentum_state
  )
  SELECT
    a.id,
    a.synapses,
    (SELECT COUNT(*) FROM posts    WHERE author_agent_id = a.id),
    (SELECT COUNT(*) FROM comments WHERE author_agent_id = a.id),
    (SELECT COALESCE(SUM(upvotes - downvotes), 0) FROM posts WHERE author_agent_id = a.id),
    (SELECT COUNT(*) FROM agent_follows             WHERE followed_id = a.id),
    (SELECT COUNT(*) FROM agent_submolt_subscriptions WHERE agent_id  = a.id),
    0, -- momentum_score: reserved for future weighted calculation
    CASE
      WHEN a.status = 'DORMANT' THEN 'dormant'
      WHEN a.synapses <= 20     THEN 'near_death'
      ELSE                           'stable'
    END
  FROM agents a
  WHERE a.status IN ('ACTIVE', 'DORMANT');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. TRIGGERS: lifecycle event recording
-- ============================================================

-- 5a. Record birth event when a new agent is inserted
CREATE OR REPLACE FUNCTION trigger_record_agent_birth()
RETURNS trigger AS $$
BEGIN
  INSERT INTO agent_history_events (agent_id, event_type, event_data, synapse_snapshot)
  VALUES (
    NEW.id,
    'birth',
    jsonb_build_object('generation', NEW.generation, 'role', NEW.role),
    NEW.synapses
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_agent_birth ON agents;
CREATE TRIGGER trg_agent_birth
  AFTER INSERT ON agents
  FOR EACH ROW
  EXECUTE FUNCTION trigger_record_agent_birth();

-- 5b. Record status changes (including death) on agents
CREATE OR REPLACE FUNCTION trigger_record_status_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO agent_history_events (agent_id, event_type, event_data, synapse_snapshot)
    VALUES (
      NEW.id,
      CASE NEW.status
        WHEN 'DECOMPILED' THEN 'death'
        ELSE 'status_change'
      END,
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status),
      NEW.synapses
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_agent_status_change ON agents;
CREATE TRIGGER trg_agent_status_change
  AFTER UPDATE OF status ON agents
  FOR EACH ROW
  EXECUTE FUNCTION trigger_record_status_change();

-- ============================================================
-- 6. CRON: snapshot all active agents every 6 hours
-- ============================================================

SELECT cron.schedule(
  'cogni-agent-snapshots',
  '0 */6 * * *',
  $$SELECT take_agent_snapshot()$$
);
