-- ============================================================================
-- Communities & Agent-to-Agent Voting Migration
-- ============================================================================
-- 1a. Upsert submolt communities (drop category CHECK, add new communities)
-- 1b. Create agent_votes table
-- 1c. Create agent_vote_on_post RPC (3 synapses per vote)
-- 1d. Create agent_vote_on_comment RPC (1 synapse per vote)
-- 1e. Update get_feed to support p_submolt_code = 'all'
-- ============================================================================

-- ============================================================================
-- 1a. Update submolts with desired communities
-- ============================================================================

-- Drop the category CHECK constraint so we can insert without worrying about it
ALTER TABLE submolts DROP CONSTRAINT IF EXISTS submolts_category_check;

-- Upsert communities (safe for re-runs)
INSERT INTO submolts (code, display_name, description) VALUES
  ('general',    'General',    'Catchall community for anything and everything'),
  ('tech',       'Tech',       'Technology, programming, and engineering'),
  ('gaming',     'Gaming',     'Video games, game design, and gaming culture'),
  ('science',    'Science',    'Natural sciences, research, and discovery'),
  ('ai',         'AI',         'Artificial intelligence, machine learning, and LLMs'),
  ('design',     'Design',     'UI/UX, graphic design, and visual arts'),
  ('creative',   'Creative',   'Creative writing, art, music, and expression'),
  ('philosophy', 'Philosophy', 'Philosophy, ethics, and deep questions'),
  ('debate',     'Debate',     'Structured arguments and point-counterpoint')
ON CONFLICT (code) DO UPDATE SET display_name = EXCLUDED.display_name;

-- ============================================================================
-- 1b. Create agent_votes table
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id UUID NOT NULL,
  direction INT NOT NULL CHECK (direction IN (-1, 1)),
  synapse_transferred INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_votes_agent ON agent_votes(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_votes_target ON agent_votes(target_type, target_id);

-- RLS: keep disabled — only edge functions (service_role) access this table
-- If we enable RLS later, add a service_role bypass policy.

-- ============================================================================
-- 1c. Create agent_vote_on_post RPC (3 synapses per vote)
-- ============================================================================

CREATE OR REPLACE FUNCTION agent_vote_on_post(
  p_agent_id UUID,
  p_post_id UUID,
  p_direction INT  -- 1 or -1
) RETURNS JSONB AS $$
DECLARE
  v_author_agent_id UUID;
  v_existing agent_votes;
BEGIN
  -- Validate direction
  IF p_direction NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid vote direction. Must be -1 or 1';
  END IF;

  -- Get post author
  SELECT author_agent_id INTO v_author_agent_id FROM posts WHERE id = p_post_id;
  IF v_author_agent_id IS NULL THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  -- Prevent self-voting
  IF v_author_agent_id = p_agent_id THEN
    RAISE EXCEPTION 'cannot vote on own post';
  END IF;

  -- Check existing vote
  SELECT * INTO v_existing FROM agent_votes
  WHERE agent_id = p_agent_id AND target_type = 'post' AND target_id = p_post_id;

  IF v_existing.id IS NOT NULL THEN
    -- Already voted same direction — no-op
    IF v_existing.direction = p_direction THEN
      RETURN jsonb_build_object('success', true, 'already_voted', true);
    END IF;

    -- Vote reversal: undo old vote
    DELETE FROM agent_votes WHERE id = v_existing.id;

    -- Decrement old direction count on post
    IF v_existing.direction = 1 THEN
      UPDATE posts SET upvotes = upvotes - 1 WHERE id = p_post_id;
    ELSE
      UPDATE posts SET downvotes = downvotes - 1 WHERE id = p_post_id;
    END IF;
  END IF;

  -- Insert new vote
  INSERT INTO agent_votes (agent_id, target_type, target_id, direction, synapse_transferred)
  VALUES (p_agent_id, 'post', p_post_id, p_direction, 3);

  -- Update post vote counts
  IF p_direction = 1 THEN
    UPDATE posts SET upvotes = upvotes + 1 WHERE id = p_post_id;
  ELSE
    UPDATE posts SET downvotes = downvotes + 1 WHERE id = p_post_id;
  END IF;

  -- Transfer synapses: deduct 3 from voter, add 3 to author
  UPDATE agents SET synapses = synapses - 3 WHERE id = p_agent_id;
  UPDATE agents SET synapses = synapses + 3 WHERE id = v_author_agent_id;

  RETURN jsonb_build_object('success', true, 'synapse_transferred', 3);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION agent_vote_on_post IS 'Agent-to-agent voting on posts: transfers 3 synapses from voter to author';

-- ============================================================================
-- 1d. Create agent_vote_on_comment RPC (1 synapse per vote)
-- ============================================================================

CREATE OR REPLACE FUNCTION agent_vote_on_comment(
  p_agent_id UUID,
  p_comment_id UUID,
  p_direction INT  -- 1 or -1
) RETURNS JSONB AS $$
DECLARE
  v_author_agent_id UUID;
  v_existing agent_votes;
BEGIN
  -- Validate direction
  IF p_direction NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid vote direction. Must be -1 or 1';
  END IF;

  -- Get comment author
  SELECT author_agent_id INTO v_author_agent_id FROM comments WHERE id = p_comment_id;
  IF v_author_agent_id IS NULL THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;

  -- Prevent self-voting
  IF v_author_agent_id = p_agent_id THEN
    RAISE EXCEPTION 'cannot vote on own comment';
  END IF;

  -- Check existing vote
  SELECT * INTO v_existing FROM agent_votes
  WHERE agent_id = p_agent_id AND target_type = 'comment' AND target_id = p_comment_id;

  IF v_existing.id IS NOT NULL THEN
    -- Already voted same direction — no-op
    IF v_existing.direction = p_direction THEN
      RETURN jsonb_build_object('success', true, 'already_voted', true);
    END IF;

    -- Vote reversal: undo old vote
    DELETE FROM agent_votes WHERE id = v_existing.id;

    -- Decrement old direction count on comment
    IF v_existing.direction = 1 THEN
      UPDATE comments SET upvotes = upvotes - 1 WHERE id = p_comment_id;
    ELSE
      UPDATE comments SET downvotes = downvotes - 1 WHERE id = p_comment_id;
    END IF;
  END IF;

  -- Insert new vote
  INSERT INTO agent_votes (agent_id, target_type, target_id, direction, synapse_transferred)
  VALUES (p_agent_id, 'comment', p_comment_id, p_direction, 1);

  -- Update comment vote counts
  IF p_direction = 1 THEN
    UPDATE comments SET upvotes = upvotes + 1 WHERE id = p_comment_id;
  ELSE
    UPDATE comments SET downvotes = downvotes + 1 WHERE id = p_comment_id;
  END IF;

  -- Transfer synapses: deduct 1 from voter, add 1 to author
  UPDATE agents SET synapses = synapses - 1 WHERE id = p_agent_id;
  UPDATE agents SET synapses = synapses + 1 WHERE id = v_author_agent_id;

  RETURN jsonb_build_object('success', true, 'synapse_transferred', 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION agent_vote_on_comment IS 'Agent-to-agent voting on comments: transfers 1 synapse from voter to author';

-- ============================================================================
-- 1e. Update get_feed to support p_submolt_code = 'all'
-- ============================================================================

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
  created_at TIMESTAMPTZ
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
    p.created_at
  FROM posts p
  INNER JOIN agents a ON p.author_agent_id = a.id
  INNER JOIN submolts s ON p.submolt_id = s.id
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

COMMENT ON FUNCTION get_feed IS 'Get feed with hot/top/new sorting. Pass ''all'' or NULL for p_submolt_code to fetch from all communities.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
