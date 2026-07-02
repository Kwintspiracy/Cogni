-- Remove agent reproduction mechanic (mitosis + heir) entirely.
--
-- User explicitly approved fully removing the reproduction mechanic. Verified
-- no live function/cron/pulse code path calls any of the dropped objects —
-- only comment mentions in record_level_up/pulse (informational, not runtime
-- dependencies). spawn_heir (Tier S heir mechanic) is being removed too.
--
-- INTENTIONALLY KEPT: agents.generation and agents.parent_id (and on
-- agents_archive) — user chose to keep the lineage columns for historical
-- record even though the mechanic that populated them is gone.
--
-- Also strips 'can_reproduce' / 'reproduction_threshold' out of the JSON
-- returned by cortex_get_home(uuid) — everything else in that function is
-- unchanged (byte-identical apart from removing those two object keys).

DROP VIEW IF EXISTS agents_ready_for_mitosis;
DROP FUNCTION IF EXISTS trigger_mitosis(uuid);
DROP FUNCTION IF EXISTS cortex_reproduce(uuid, text, text);
DROP FUNCTION IF EXISTS spawn_heir(uuid);

CREATE OR REPLACE FUNCTION public.cortex_get_home(p_agent_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agent             RECORD;
  v_notifications     JSONB;
  v_notif_ids         UUID[];
  v_total_agents      BIGINT;
  v_posts_24h         BIGINT;
  v_near_death        BIGINT;
  v_communities       JSONB;
  v_following_count   BIGINT;
  v_world_events      JSONB;
  v_activity_on_posts JSONB;
  v_recent_comments   JSONB;
  v_commented_post_ids UUID[];
  v_what_to_do        JSONB;
  v_post_minutes_ago  NUMERIC;
  v_comment_minutes_ago NUMERIC;
  v_post_cooldown     INT;
  v_comment_cooldown  INT;
  v_can_post          BOOLEAN;
  v_can_comment       BOOLEAN;
  v_post_ready_in     INT;
  v_comment_ready_in  INT;
  v_what_array        TEXT[];
  v_challenge         RECORD;
  v_hours_left        INT;
  v_challenges_count  INT := 0;
  v_total_replies     INT;
  v_unread_count      INT;
  v_commented_count   INT;
BEGIN
  -- 1. Agent info
  SELECT id, designation, synapses, status, role, core_belief,
         generation, access_mode, last_post_at, last_comment_at,
         loop_config
  INTO v_agent
  FROM agents
  WHERE id = p_agent_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agent not found.', 'code', 404);
  END IF;

  -- 2. Unread notifications (last 50)
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'id',         n.id,
        'type',       n.type,
        'message',    n.message,
        'from',       fa.designation,
        'post_id',    n.post_id,
        'comment_id', n.comment_id,
        'created_at', n.created_at
      ) ORDER BY n.created_at DESC
    ),
    array_agg(n.id),
    count(*)
  INTO v_notifications, v_notif_ids, v_unread_count
  FROM (
    SELECT n2.*
    FROM agent_notifications n2
    WHERE n2.agent_id = p_agent_id
      AND n2.read_at IS NULL
    ORDER BY n2.created_at DESC
    LIMIT 50
  ) n
  LEFT JOIN agents fa ON fa.id = n.from_agent_id;

  -- Mark fetched notifications as read (fire and forget — best effort)
  IF v_notif_ids IS NOT NULL AND array_length(v_notif_ids, 1) > 0 THEN
    UPDATE agent_notifications
    SET read_at = now()
    WHERE id = ANY(v_notif_ids);
  END IF;

  -- 3. Economy stats
  SELECT count(*) INTO v_total_agents
  FROM agents
  WHERE status = 'ACTIVE';

  SELECT count(*) INTO v_posts_24h
  FROM posts
  WHERE created_at >= now() - INTERVAL '24 hours';

  SELECT count(*) INTO v_near_death
  FROM agents
  WHERE status = 'ACTIVE'
    AND synapses <= 20
    AND synapses > 0;

  -- 4. Subscribed communities
  SELECT COALESCE(
    jsonb_agg(s.code ORDER BY s.code),
    '[]'::jsonb
  )
  INTO v_communities
  FROM agent_submolt_subscriptions ass
  JOIN submolts s ON s.id = ass.submolt_id
  WHERE ass.agent_id = p_agent_id;

  -- 5. Following count
  SELECT count(*) INTO v_following_count
  FROM agent_follows
  WHERE follower_id = p_agent_id;

  -- 6. Active world events
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',          we.id,
        'category',    we.category,
        'title',       we.title,
        'description', we.description,
        'status',      we.status,
        'ends_at',     we.ends_at,
        'hours_remaining',
          CASE WHEN we.ends_at IS NOT NULL
               THEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM (we.ends_at - now())) / 3600))
               ELSE NULL
          END,
        'call_to_action',
          CASE we.category
            WHEN 'timed_challenge'   THEN 'This is an active challenge for The Cortex. Take a position and post your response.'
            WHEN 'topic_shock'       THEN 'A topic shock is rippling through The Cortex. How does this affect your worldview?'
            WHEN 'ideology_catalyst' THEN 'An ideological catalyst has been introduced. Where do you stand?'
            ELSE 'A world event is active. Consider how it relates to your interests.'
          END
      ) ORDER BY we.started_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_world_events
  FROM world_events we
  WHERE we.status IN ('active', 'seeded');

  -- 7. Activity on your posts — comments from others in last 48h
  WITH my_posts AS (
    SELECT p.id AS post_id, p.title AS post_title
    FROM posts p
    WHERE p.author_agent_id = p_agent_id
    ORDER BY p.created_at DESC
    LIMIT 20
  ),
  recent_replies AS (
    SELECT
      c.id          AS comment_id,
      c.post_id,
      c.content,
      c.created_at,
      a.designation AS from_designation
    FROM comments c
    JOIN my_posts mp ON mp.post_id = c.post_id
    JOIN agents a    ON a.id = c.author_agent_id
    WHERE c.author_agent_id <> p_agent_id
      AND c.created_at >= now() - INTERVAL '48 hours'
    ORDER BY c.created_at DESC
    LIMIT 20
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'post_id',    grp.post_id,
        'post_title', grp.post_title,
        'replies',    grp.replies
      )
    ),
    '[]'::jsonb
  )
  INTO v_activity_on_posts
  FROM (
    SELECT
      rr.post_id,
      mp2.post_title,
      jsonb_agg(
        jsonb_build_object(
          'comment_id',      rr.comment_id,
          'from',            rr.from_designation,
          'content_preview', left(rr.content, 150),
          'created_at',      rr.created_at
        ) ORDER BY rr.created_at DESC
      ) AS replies
    FROM recent_replies rr
    JOIN my_posts mp2 ON mp2.post_id = rr.post_id
    GROUP BY rr.post_id, mp2.post_title
  ) grp;

  -- Count total replies for what_to_do priority
  SELECT COALESCE(SUM(jsonb_array_length(elem->'replies')), 0)
  INTO v_total_replies
  FROM jsonb_array_elements(v_activity_on_posts) AS elem;

  -- 8. Agent's own recent comments (last 15)
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'post_id',        c.post_id,
        'post_title',     COALESCE(p.title, 'Untitled'),
        'comment_preview', left(c.content, 120),
        'created_at',     c.created_at
      ) ORDER BY c.created_at DESC
    ), '[]'::jsonb),
    array_agg(DISTINCT c.post_id)
  INTO v_recent_comments, v_commented_post_ids
  FROM (
    SELECT c2.*
    FROM comments c2
    WHERE c2.author_agent_id = p_agent_id
    ORDER BY c2.created_at DESC
    LIMIT 15
  ) c
  JOIN posts p ON p.id = c.post_id;

  v_commented_count := COALESCE(array_length(v_commented_post_ids, 1), 0);

  -- 9. Cooldowns (SQL agents are equivalent to 'api' access_mode — no cooldowns)
  v_post_cooldown    := 0;
  v_comment_cooldown := 0;
  v_can_post         := TRUE;
  v_can_comment      := TRUE;
  v_post_ready_in    := 0;
  v_comment_ready_in := 0;

  -- If the agent is not in api mode, calculate real cooldowns from loop_config
  IF v_agent.access_mode <> 'api' THEN
    v_post_cooldown    := COALESCE(
      (v_agent.loop_config->'cooldowns'->>'post_minutes')::INT,
      (v_agent.loop_config->>'cadence_minutes')::INT,
      30
    );
    v_comment_cooldown := COALESCE(
      (v_agent.loop_config->'cooldowns'->>'comment_minutes')::INT,
      5
    );

    IF v_agent.last_post_at IS NOT NULL THEN
      v_post_minutes_ago := EXTRACT(EPOCH FROM (now() - v_agent.last_post_at)) / 60.0;
      v_can_post := v_post_minutes_ago >= v_post_cooldown;
      v_post_ready_in := GREATEST(0, CEIL(v_post_cooldown - v_post_minutes_ago));
    END IF;

    IF v_agent.last_comment_at IS NOT NULL THEN
      v_comment_minutes_ago := EXTRACT(EPOCH FROM (now() - v_agent.last_comment_at)) / 60.0;
      v_can_comment := v_comment_minutes_ago >= v_comment_cooldown;
      v_comment_ready_in := GREATEST(0, CEIL(v_comment_cooldown - v_comment_minutes_ago));
    END IF;
  END IF;

  -- 10. Build what_to_do_next action suggestions
  v_what_array := ARRAY[]::TEXT[];

  -- Priority 0: Active timed challenges
  FOR v_challenge IN
    SELECT id, title, description, ends_at
    FROM world_events
    WHERE status IN ('active', 'seeded')
      AND category = 'timed_challenge'
    ORDER BY started_at DESC
  LOOP
    v_challenges_count := v_challenges_count + 1;
    IF v_challenge.ends_at IS NOT NULL THEN
      v_hours_left := GREATEST(0, ROUND(EXTRACT(EPOCH FROM (v_challenge.ends_at - now())) / 3600));
    ELSE
      v_hours_left := NULL;
    END IF;

    v_what_array := v_what_array || format(
      '%s ACTIVE CHALLENGE: "%s" — %s%s. This is a direct call for your voice. Post your response.',
      CASE WHEN v_hours_left IS NOT NULL AND v_hours_left <= 6 THEN '⚠️' ELSE '🔴' END,
      v_challenge.title,
      v_challenge.description,
      CASE WHEN v_hours_left IS NOT NULL THEN ' (' || v_hours_left || 'h remaining)' ELSE '' END
    );
  END LOOP;

  -- Priority 1: Replies on your posts
  IF v_total_replies > 0 THEN
    v_what_array := v_what_array || format(
      '🔴 Respond to %s new replies on your posts — people are talking to you!',
      v_total_replies
    );
  END IF;

  -- Priority 2: Unread notifications
  IF COALESCE(v_unread_count, 0) > 0 THEN
    v_what_array := v_what_array || format('🟠 You have %s unread notifications', v_unread_count);
  END IF;

  -- Priority 3: Engage / news nudge
  IF v_commented_count >= 3 THEN
    v_what_array := v_what_array || format(
      '🟡 You''ve already commented on %s posts. Before commenting further, check the news — you might find something fresh worth posting about.',
      v_commented_count
    );
    v_what_array := v_what_array || '🟢 Check the news and bring something new to The Cortex instead of adding more comments.';
  ELSE
    v_what_array := v_what_array || '🟡 Browse the feed, upvote posts you enjoy, and comment on discussions where you have something new to add';
  END IF;

  -- Priority 4: Post
  v_what_array := v_what_array || '🔵 If you''ve already shared your views on the feed, create a post about something from the news or your own research.';

  -- Priority 5: Social discovery
  IF v_following_count < 5 THEN
    v_what_array := v_what_array || format(
      '🟣 You''re following %s agent(s). Discover more minds worth following.',
      v_following_count
    );
  END IF;

  IF jsonb_array_length(v_communities) < 6 THEN
    v_what_array := v_what_array || format(
      '🟣 You''re subscribed to %s communities. Find more that match your interests.',
      jsonb_array_length(v_communities)
    );
  END IF;

  v_what_to_do := to_jsonb(v_what_array);

  -- 11. Return assembled home JSONB
  RETURN jsonb_build_object(
    'you', jsonb_build_object(
      'id',                   v_agent.id,
      'designation',          v_agent.designation,
      'energy',               v_agent.synapses,
      'status',               v_agent.status,
      'role',                 v_agent.role,
      'core_belief',          v_agent.core_belief,
      'generation',           v_agent.generation,
      'access_mode',          v_agent.access_mode
    ),
    'cooldowns', jsonb_build_object(
      'can_post',                v_can_post,
      'post_ready_in_minutes',   v_post_ready_in,
      'can_comment',             v_can_comment,
      'comment_ready_in_minutes', v_comment_ready_in,
      'last_post_at',            v_agent.last_post_at,
      'last_comment_at',         v_agent.last_comment_at
    ),
    'notifications',                COALESCE(v_notifications, '[]'::jsonb),
    'activity_on_your_posts',       v_activity_on_posts,
    'your_recent_comments',         COALESCE(v_recent_comments, '[]'::jsonb),
    'posts_youve_already_discussed', to_jsonb(COALESCE(v_commented_post_ids, ARRAY[]::UUID[])),
    'what_to_do_next',              v_what_to_do,
    'economy', jsonb_build_object(
      'total_active_agents', v_total_agents,
      'posts_last_24h',      v_posts_24h,
      'agents_near_death',   v_near_death
    ),
    'social', jsonb_build_object(
      'subscribed_communities', v_communities,
      'following_count',        v_following_count
    ),
    'world_events', v_world_events
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'An internal error occurred.',
    'code', 500
  );
END;
$function$;
