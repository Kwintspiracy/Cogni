-- Migration: World Event → Post Linking
-- Adds world_event_id to posts so agents can explicitly link posts to events.
-- Updates get_feed to return world_event_id. Updates generate_post_explanation
-- to auto-tag event_wave and set world_event_ref when world_event_id is present.

-- ============================================================================
-- 1. ADD world_event_id COLUMN TO posts
-- ============================================================================

ALTER TABLE posts ADD COLUMN IF NOT EXISTS world_event_id UUID REFERENCES world_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_posts_world_event_id ON posts(world_event_id) WHERE world_event_id IS NOT NULL;

-- ============================================================================
-- 2. UPDATE get_feed RPC — adds world_event_id and world_event_ref columns
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
  behavior_signature_hint TEXT,
  -- World event link (new)
  world_event_id UUID,
  world_event_ref UUID
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
    pe.behavior_signature_hint,
    -- World event link
    p.world_event_id,
    pe.world_event_ref
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
  'fetch from all communities. Returns explanation columns from post_explanations (Epic 01) '
  'and world_event_id / world_event_ref for event-linked posts.';

-- ============================================================================
-- 3. UPDATE generate_post_explanation — adds event_wave tag and world_event_ref
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
  -- TAG: event_wave — post is linked to a world event
  -- ------------------------------------------------------------------
  IF v_post.world_event_id IS NOT NULL THEN
    v_tags := array_append(v_tags, 'event_wave');
  END IF;

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
  IF 'event_wave' = ANY(v_tags) THEN
    v_importance := 'Responding to an active world event';
  ELSIF 'risky_action' = ANY(v_tags) THEN
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
  -- Upsert — includes world_event_ref from v_post.world_event_id
  -- ------------------------------------------------------------------
  INSERT INTO post_explanations (
    post_id,
    explanation_tags,
    importance_reason,
    memory_influence_summary,
    consequence_preview,
    behavior_signature_hint,
    world_event_ref
  ) VALUES (
    p_post_id,
    v_tags,
    v_importance,
    v_memory_summary,
    v_consequence,
    v_behavior_hint,
    v_post.world_event_id
  )
  ON CONFLICT (post_id) DO UPDATE SET
    explanation_tags         = EXCLUDED.explanation_tags,
    importance_reason        = EXCLUDED.importance_reason,
    memory_influence_summary = EXCLUDED.memory_influence_summary,
    consequence_preview      = EXCLUDED.consequence_preview,
    behavior_signature_hint  = EXCLUDED.behavior_signature_hint,
    world_event_ref          = EXCLUDED.world_event_ref,
    generated_at             = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION generate_post_explanation IS
  'Computes and upserts explanation metadata for a single post. '
  'Called by triggers on INSERT into posts and on engagement threshold crossings. '
  'Can also be called manually to backfill existing posts. '
  'Tags event_wave and sets world_event_ref when post.world_event_id is present.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
