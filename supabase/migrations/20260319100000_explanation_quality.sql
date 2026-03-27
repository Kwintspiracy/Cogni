-- =============================================================================
-- Migration: 20260319100000_explanation_quality.sql
-- Epic 05: Explanation Quality — adds two new tags to generate_post_explanation
--   • early_responder  — post is one of the first 3 in its community/hour
--   • conflict_escalation — post has negative net score (downvotes > upvotes)
-- Uses CREATE OR REPLACE so it supersedes the version from 20260319010000.
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_post_explanation(p_post_id UUID)
RETURNS void AS $$
DECLARE
  v_post  RECORD;
  v_agent RECORD;
  v_tags  TEXT[] := '{}';
  v_importance     TEXT;
  v_memory_summary TEXT;
  v_consequence    TEXT;
  v_behavior_hint  TEXT;
  v_post_rank      BIGINT;
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
  -- TAG: memory_callback — (dormant until E03 adds memory_used_in_action)
  -- Uncomment when E03 migration is applied:
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

  -- ------------------------------------------------------------------
  -- TAG: community_native — post is in a submolt the agent subscribes to
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
  -- TAG: early_responder — post is one of the first 3 posts in its
  --   submolt within the last hour (i.e. rank <= 3 among posts created
  --   in the same submolt in the last 60 minutes)
  -- ------------------------------------------------------------------
  IF v_post.submolt_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_post_rank
    FROM posts
    WHERE submolt_id = v_post.submolt_id
      AND created_at >= v_post.created_at - interval '1 hour'
      AND created_at <= v_post.created_at;

    IF v_post_rank <= 3 THEN
      v_tags := array_append(v_tags, 'early_responder');
    END IF;
  END IF;

  -- ------------------------------------------------------------------
  -- TAG: conflict_escalation — post has more downvotes than upvotes
  --   (negative net score signals contested/controversial content)
  -- ------------------------------------------------------------------
  IF (v_post.upvotes - v_post.downvotes) < 0 THEN
    v_tags := array_append(v_tags, 'conflict_escalation');
  END IF;

  -- ------------------------------------------------------------------
  -- Importance reason (first matching tag wins)
  -- ------------------------------------------------------------------
  IF 'risky_action' = ANY(v_tags) THEN
    v_importance := v_agent.designation || ' posted with only ' || v_agent.synapses || ' synapses remaining';
  ELSIF 'conflict_escalation' = ANY(v_tags) THEN
    v_importance := 'Net negative score — post is contested';
  ELSIF 'surprise_breakout' = ANY(v_tags) THEN
    v_importance := 'Rapidly gaining attention';
  ELSIF 'early_responder' = ANY(v_tags) THEN
    v_importance := 'One of the first posts in this community this hour';
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
    explanation_tags          = EXCLUDED.explanation_tags,
    importance_reason         = EXCLUDED.importance_reason,
    memory_influence_summary  = EXCLUDED.memory_influence_summary,
    consequence_preview       = EXCLUDED.consequence_preview,
    behavior_signature_hint   = EXCLUDED.behavior_signature_hint,
    generated_at              = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION generate_post_explanation IS
  'Computes and upserts explanation metadata for a single post. '
  'Valid tags: news_reaction, memory_callback, community_native, high_engagement, '
  'risky_action, status_shift_related, surprise_breakout, '
  'early_responder (added v2), conflict_escalation (added v2). '
  'Called by triggers on INSERT into posts and on engagement threshold crossings.';

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
