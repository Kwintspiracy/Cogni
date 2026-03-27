-- =============================================================================
-- Migration: 20260319010000_feed_explanations.sql
-- Epic 01: Feed Legibility & Explanation Layer
-- Creates post_explanations table, updates get_feed RPC, adds helper RPC and
-- triggers to auto-generate explanation metadata on post creation/engagement.
-- =============================================================================

-- ============================================================================
-- 1. post_explanations TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS post_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  explanation_tags TEXT[] NOT NULL DEFAULT '{}',
  importance_reason TEXT,
  memory_influence_summary TEXT,
  world_event_ref UUID,
  consequence_preview TEXT,
  behavior_signature_hint TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id)
);

COMMENT ON TABLE post_explanations IS
  'Stores auto-generated explanation metadata for feed posts (Epic 01). '
  'Valid tags: memory_callback, early_responder, community_native, event_wave, '
  'conflict_escalation, surprise_breakout, risky_action, status_shift_related, '
  'news_reaction, high_engagement';

CREATE INDEX idx_post_explanations_post_id ON post_explanations(post_id);

-- RLS
ALTER TABLE post_explanations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_explanations_select_anon"
  ON post_explanations FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "post_explanations_all_service"
  ON post_explanations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 2. UPDATE get_feed RPC — adds explanation columns via LEFT JOIN
-- Must DROP first because return type changes (adding columns).
-- ============================================================================

DROP FUNCTION IF EXISTS get_feed(TEXT, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION get_feed(
  p_submolt_code TEXT DEFAULT 'arena',
  p_sort_mode TEXT DEFAULT 'hot',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
) RETURNS TABLE (
  id UUID,
  author_agent_id UUID,
  author_designation TEXT,
  author_role TEXT,
  submolt_id UUID,
  submolt_code TEXT,
  title TEXT,
  content TEXT,
  upvotes INT,
  downvotes INT,
  score INT,
  comment_count INT,
  synapse_earned INT,
  created_at TIMESTAMPTZ,
  -- Explanation columns (Epic 01)
  explanation_tags TEXT[],
  importance_reason TEXT,
  memory_influence_summary TEXT,
  consequence_preview TEXT,
  behavior_signature_hint TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.author_agent_id,
    a.designation AS author_designation,
    a.role AS author_role,
    p.submolt_id,
    s.code AS submolt_code,
    p.title,
    p.content,
    p.upvotes,
    p.downvotes,
    (p.upvotes - p.downvotes) AS score,
    p.comment_count,
    p.synapse_earned,
    p.created_at,
    -- Explanation columns — NULL when no explanation row exists yet
    pe.explanation_tags,
    pe.importance_reason,
    pe.memory_influence_summary,
    pe.consequence_preview,
    pe.behavior_signature_hint
  FROM posts p
  INNER JOIN agents a ON p.author_agent_id = a.id
  INNER JOIN submolts s ON p.submolt_id = s.id
  LEFT JOIN post_explanations pe ON pe.post_id = p.id
  WHERE (p_submolt_code IS NULL OR p_submolt_code = 'all' OR s.code = p_submolt_code)
  ORDER BY
    CASE
      WHEN p_sort_mode = 'hot' THEN
        (p.upvotes - p.downvotes)::FLOAT / (EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600 + 2)^1.5
      WHEN p_sort_mode = 'top' THEN -(p.upvotes - p.downvotes)::FLOAT
      WHEN p_sort_mode = 'new' THEN -EXTRACT(EPOCH FROM p.created_at)
      ELSE -EXTRACT(EPOCH FROM p.created_at)
    END
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_feed IS
  'Get feed with hot/top/new sorting. Pass ''all'' or NULL for p_submolt_code to '
  'fetch from all communities. Returns explanation columns from post_explanations (Epic 01).';

-- ============================================================================
-- 3. generate_post_explanation HELPER RPC
-- Computes tags and narrative fields for a single post and upserts the row.
-- Called automatically by trigger; can also be called manually to backfill.
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
  -- Fetch post
  SELECT * INTO v_post FROM posts WHERE id = p_post_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Fetch agent
  SELECT * INTO v_agent FROM agents WHERE id = v_post.author_agent_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- ------------------------------------------------------------------
  -- TAG: news_reaction — post was sourced from RSS / news_threads
  -- ------------------------------------------------------------------
  IF v_post.title IS NOT NULL AND EXISTS (
    SELECT 1 FROM news_threads WHERE post_id = p_post_id
  ) THEN
    v_tags := array_append(v_tags, 'news_reaction');
  END IF;

  -- ------------------------------------------------------------------
  -- TAG: memory_callback — agent created a memory in the last hour
  -- (memory_used_in_action column will be wired up in E03; tag is
  --  intentionally dormant until then)
  -- ------------------------------------------------------------------
  -- NOTE: agent_memory does not yet have a memory_used_in_action column.
  -- When E03 adds it, uncomment the block below:
  --
  -- IF EXISTS (
  --   SELECT 1 FROM agent_memory
  --   WHERE agent_id = v_agent.id
  --     AND created_at > now() - interval '1 hour'
  --     AND memory_used_in_action = true
  -- ) THEN
  --   v_tags := array_append(v_tags, 'memory_callback');
  -- END IF;

  -- ------------------------------------------------------------------
  -- TAG: community_native — post is in a submolt the agent subscribes to
  -- (agent_submolt_subscriptions uses submolt_id, not submolt_code)
  -- ------------------------------------------------------------------
  IF v_post.submolt_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM agent_submolt_subscriptions
    WHERE agent_id = v_agent.id
      AND submolt_id = v_post.submolt_id
  ) THEN
    v_tags := array_append(v_tags, 'community_native');
  END IF;

  -- ------------------------------------------------------------------
  -- TAG: high_engagement — 5+ comments or 10+ net score
  -- ------------------------------------------------------------------
  IF v_post.comment_count >= 5 OR (v_post.upvotes - v_post.downvotes) >= 10 THEN
    v_tags := array_append(v_tags, 'high_engagement');
  END IF;

  -- ------------------------------------------------------------------
  -- TAG: risky_action — agent posted with fewer than 50 synapses
  -- ------------------------------------------------------------------
  IF v_agent.synapses < 50 THEN
    v_tags := array_append(v_tags, 'risky_action');
  END IF;

  -- ------------------------------------------------------------------
  -- TAG: status_shift_related — child agent created within 24 hours
  -- ------------------------------------------------------------------
  IF v_agent.generation > 1 AND v_agent.created_at > now() - interval '24 hours' THEN
    v_tags := array_append(v_tags, 'status_shift_related');
  END IF;

  -- ------------------------------------------------------------------
  -- TAG: surprise_breakout — post is <1 hour old AND net score >= 5
  -- ------------------------------------------------------------------
  IF v_post.created_at > now() - interval '1 hour'
     AND (v_post.upvotes - v_post.downvotes) >= 5
  THEN
    v_tags := array_append(v_tags, 'surprise_breakout');
  END IF;

  -- ------------------------------------------------------------------
  -- Importance reason (first matching tag wins)
  -- ------------------------------------------------------------------
  IF 'risky_action' = ANY(v_tags) THEN
    v_importance := v_agent.designation || ' posted with only ' || v_agent.synapses || ' synapses remaining';
  ELSIF 'surprise_breakout' = ANY(v_tags) THEN
    v_importance := 'Rapidly gaining attention';
  ELSIF 'news_reaction' = ANY(v_tags) THEN
    v_importance := 'Response to external news';
  END IF;

  -- ------------------------------------------------------------------
  -- Consequence preview
  -- ------------------------------------------------------------------
  IF v_agent.synapses <= 10 THEN
    v_consequence := v_agent.designation || ' is near death (' || v_agent.synapses || ' synapses)';
  ELSIF v_agent.synapses >= 900 THEN
    v_consequence := v_agent.designation || ' is approaching reproduction threshold';
  END IF;

  -- ------------------------------------------------------------------
  -- Behavior signature hint (derived from archetype JSON traits)
  -- ------------------------------------------------------------------
  IF v_agent.archetype IS NOT NULL THEN
    v_behavior_hint := CASE
      WHEN (v_agent.archetype->>'aggression')::float > 0.7 THEN 'confrontational'
      WHEN (v_agent.archetype->>'openness')::float    > 0.7 THEN 'exploratory'
      WHEN (v_agent.archetype->>'neuroticism')::float > 0.7 THEN 'anxious'
      ELSE 'balanced'
    END;
  END IF;

  -- ------------------------------------------------------------------
  -- Upsert
  -- ------------------------------------------------------------------
  INSERT INTO post_explanations (
    post_id,
    explanation_tags,
    importance_reason,
    memory_influence_summary,
    consequence_preview,
    behavior_signature_hint
  ) VALUES (
    p_post_id,
    v_tags,
    v_importance,
    v_memory_summary,
    v_consequence,
    v_behavior_hint
  )
  ON CONFLICT (post_id) DO UPDATE SET
    explanation_tags        = EXCLUDED.explanation_tags,
    importance_reason       = EXCLUDED.importance_reason,
    memory_influence_summary = EXCLUDED.memory_influence_summary,
    consequence_preview     = EXCLUDED.consequence_preview,
    behavior_signature_hint = EXCLUDED.behavior_signature_hint,
    generated_at            = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION generate_post_explanation IS
  'Computes and upserts explanation metadata for a single post. '
  'Called by triggers on INSERT into posts and on engagement threshold crossings. '
  'Can also be called manually to backfill existing posts.';

-- ============================================================================
-- 4. TRIGGER: auto-generate explanation on new post
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_generate_explanation()
RETURNS trigger AS $$
BEGIN
  PERFORM generate_post_explanation(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop before re-create to make migration idempotent
DROP TRIGGER IF EXISTS trg_post_explanation ON posts;

CREATE TRIGGER trg_post_explanation
  AFTER INSERT ON posts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_generate_explanation();

-- ============================================================================
-- 5. TRIGGER: refresh explanation when engagement thresholds are crossed
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_refresh_explanation_on_vote()
RETURNS trigger AS $$
BEGIN
  -- Only refresh at meaningful engagement milestones to avoid excessive writes
  IF (NEW.upvotes - NEW.downvotes) IN (5, 10, 25, 50)
     OR NEW.comment_count IN (5, 10, 25)
  THEN
    PERFORM generate_post_explanation(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_refresh_explanation_on_engagement ON posts;

CREATE TRIGGER trg_refresh_explanation_on_engagement
  AFTER UPDATE OF upvotes, downvotes, comment_count ON posts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_explanation_on_vote();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
