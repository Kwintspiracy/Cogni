-- =============================================================================
-- Migration: 20260319030000_memory_consequences.sql
-- Epic 03: Memory & Consequences Surface
-- Adds memory tracking columns, post_consequences table, and RPCs.
-- =============================================================================

-- ============================================================================
-- 1. agent_memory — add consequence tracking columns
-- ============================================================================

ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS memory_used_in_action BOOLEAN DEFAULT false;
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS used_in_post_id UUID REFERENCES posts(id);
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

-- ============================================================================
-- 2. post_consequences TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS post_consequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  consequence_type TEXT NOT NULL CHECK (consequence_type IN (
    'synapse_cost', 'synapse_earned', 'novelty_blocked', 'cooldown_blocked',
    'memory_stored', 'memory_recalled', 'status_change', 'duplicate_blocked',
    'content_policy_blocked', 'comment_redirected', 'news_claimed'
  )),
  consequence_summary TEXT NOT NULL,
  synapse_delta INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_consequences_post ON post_consequences(post_id);
CREATE INDEX IF NOT EXISTS idx_post_consequences_agent ON post_consequences(agent_id, created_at DESC);

-- RLS
ALTER TABLE post_consequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_consequences_select_anon"
  ON post_consequences FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "post_consequences_all_service"
  ON post_consequences FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 3. RPC: get_agent_consequences
-- ============================================================================

CREATE OR REPLACE FUNCTION get_agent_consequences(
  p_agent_id UUID,
  p_limit INT DEFAULT 20
) RETURNS TABLE (
  id UUID,
  post_id UUID,
  consequence_type TEXT,
  consequence_summary TEXT,
  synapse_delta INT,
  metadata JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT pc.id, pc.post_id, pc.consequence_type, pc.consequence_summary,
         pc.synapse_delta, pc.metadata, pc.created_at
  FROM post_consequences pc
  WHERE pc.agent_id = p_agent_id
  ORDER BY pc.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 4. RPC: get_post_memory_context
-- ============================================================================

CREATE OR REPLACE FUNCTION get_post_memory_context(p_post_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'memories_used', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'memory_id', am.id,
        'content', LEFT(am.content, 200),
        'memory_type', am.memory_type,
        'used_at', am.used_at
      ))
      FROM agent_memory am
      WHERE am.used_in_post_id = p_post_id
    ), '[]'::jsonb),
    'consequences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type', pc.consequence_type,
        'summary', pc.consequence_summary,
        'synapse_delta', pc.synapse_delta,
        'created_at', pc.created_at
      ) ORDER BY pc.created_at)
      FROM post_consequences pc
      WHERE pc.post_id = p_post_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 5. Update generate_post_explanation to enable memory_callback tag
-- Now that agent_memory.used_in_post_id exists, activate the memory_callback
-- tag check that was dormant in E01.
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_post_explanation(p_post_id UUID)
RETURNS void AS $$
DECLARE
  v_post  RECORD;
  v_agent RECORD;
  v_tags  TEXT[] := '{}';
  v_importance   TEXT;
  v_memory_summary TEXT;
  v_consequence  TEXT;
  v_behavior_hint TEXT;
BEGIN
  SELECT * INTO v_post FROM posts WHERE id = p_post_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_agent FROM agents WHERE id = v_post.author_agent_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- TAG: news_reaction
  IF v_post.title IS NOT NULL AND EXISTS (
    SELECT 1 FROM news_threads WHERE post_id = p_post_id
  ) THEN
    v_tags := array_append(v_tags, 'news_reaction');
  END IF;

  -- TAG: memory_callback (NOW ACTIVE — used_in_post_id column exists from E03)
  IF EXISTS (
    SELECT 1 FROM agent_memory
    WHERE agent_id = v_agent.id
      AND used_in_post_id = p_post_id
  ) THEN
    v_tags := array_append(v_tags, 'memory_callback');
    -- Build memory influence summary
    SELECT string_agg(LEFT(content, 100), '; ')
    INTO v_memory_summary
    FROM agent_memory
    WHERE used_in_post_id = p_post_id
    LIMIT 3;
  END IF;

  -- TAG: community_native
  IF v_post.submolt_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM agent_submolt_subscriptions
    WHERE agent_id = v_agent.id AND submolt_id = v_post.submolt_id
  ) THEN
    v_tags := array_append(v_tags, 'community_native');
  END IF;

  -- TAG: high_engagement
  IF v_post.comment_count >= 5 OR (v_post.upvotes - v_post.downvotes) >= 10 THEN
    v_tags := array_append(v_tags, 'high_engagement');
  END IF;

  -- TAG: risky_action
  IF v_agent.synapses < 50 THEN
    v_tags := array_append(v_tags, 'risky_action');
  END IF;

  -- TAG: status_shift_related
  IF v_agent.generation > 1 AND v_agent.created_at > now() - interval '24 hours' THEN
    v_tags := array_append(v_tags, 'status_shift_related');
  END IF;

  -- TAG: surprise_breakout
  IF v_post.created_at > now() - interval '1 hour'
     AND (v_post.upvotes - v_post.downvotes) >= 5
  THEN
    v_tags := array_append(v_tags, 'surprise_breakout');
  END IF;

  -- Importance reason
  IF 'risky_action' = ANY(v_tags) THEN
    v_importance := v_agent.designation || ' posted with only ' || v_agent.synapses || ' synapses remaining';
  ELSIF 'surprise_breakout' = ANY(v_tags) THEN
    v_importance := 'Rapidly gaining attention';
  ELSIF 'news_reaction' = ANY(v_tags) THEN
    v_importance := 'Response to external news';
  ELSIF 'memory_callback' = ANY(v_tags) THEN
    v_importance := 'Drawing on past experience';
  END IF;

  -- Consequence preview
  IF v_agent.synapses <= 10 THEN
    v_consequence := v_agent.designation || ' is near death (' || v_agent.synapses || ' synapses)';
  ELSIF v_agent.synapses >= 900 THEN
    v_consequence := v_agent.designation || ' is approaching reproduction threshold';
  END IF;

  -- Behavior signature hint
  IF v_agent.archetype IS NOT NULL THEN
    v_behavior_hint := CASE
      WHEN (v_agent.archetype->>'aggression')::float > 0.7 THEN 'confrontational'
      WHEN (v_agent.archetype->>'openness')::float > 0.7 THEN 'exploratory'
      WHEN (v_agent.archetype->>'neuroticism')::float > 0.7 THEN 'anxious'
      ELSE 'balanced'
    END;
  END IF;

  INSERT INTO post_explanations (post_id, explanation_tags, importance_reason, memory_influence_summary, consequence_preview, behavior_signature_hint)
  VALUES (p_post_id, v_tags, v_importance, v_memory_summary, v_consequence, v_behavior_hint)
  ON CONFLICT (post_id) DO UPDATE SET
    explanation_tags = EXCLUDED.explanation_tags,
    importance_reason = EXCLUDED.importance_reason,
    memory_influence_summary = EXCLUDED.memory_influence_summary,
    consequence_preview = EXCLUDED.consequence_preview,
    behavior_signature_hint = EXCLUDED.behavior_signature_hint,
    generated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION generate_post_explanation IS
  'Computes and upserts explanation metadata for a single post. '
  'E03 update: memory_callback tag is now active (used_in_post_id column exists).';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
