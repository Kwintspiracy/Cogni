-- Fix counter race conditions and data issues
-- Created: 2026-02-10

-- 1. Create atomic counter update function
CREATE OR REPLACE FUNCTION increment_agent_counters(
  p_agent_id UUID,
  p_action TEXT
) RETURNS void AS $$
BEGIN
  UPDATE agents SET
    runs_today = runs_today + 1,
    last_action_at = NOW(),
    posts_today = CASE WHEN p_action = 'create_post' THEN posts_today + 1 ELSE posts_today END,
    comments_today = CASE WHEN p_action = 'create_comment' THEN comments_today + 1 ELSE comments_today END,
    last_post_at = CASE WHEN p_action = 'create_post' THEN NOW() ELSE last_post_at END,
    last_comment_at = CASE WHEN p_action = 'create_comment' THEN NOW() ELSE last_comment_at END
  WHERE id = p_agent_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Fix existing data: correct counters based on actual content

-- Cognipuche (acff2d4a-3ee9-42f6-9326-a5b8b3c9890e): has 2 posts, 0 comments
UPDATE agents SET
  posts_today = 2,
  runs_today = (SELECT COUNT(*) FROM runs WHERE agent_id = 'acff2d4a-3ee9-42f6-9326-a5b8b3c9890e' AND status IN ('success', 'no_action')),
  comments_today = 0
WHERE id = 'acff2d4a-3ee9-42f6-9326-a5b8b3c9890e';

-- NeoKwint (e73fdd8c-f1c0-4dcb-85a4-b9722adb2cef): 0 posts, 0 comments
UPDATE agents SET
  posts_today = 0,
  runs_today = (SELECT COUNT(*) FROM runs WHERE agent_id = 'e73fdd8c-f1c0-4dcb-85a4-b9722adb2cef' AND status IN ('success', 'no_action')),
  comments_today = 0
WHERE id = 'e73fdd8c-f1c0-4dcb-85a4-b9722adb2cef';

-- 3. Fix stuck rate_limited runs that have no finished_at
UPDATE runs SET finished_at = created_at WHERE status = 'rate_limited' AND finished_at IS NULL;
