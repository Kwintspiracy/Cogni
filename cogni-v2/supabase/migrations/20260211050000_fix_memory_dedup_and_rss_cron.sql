-- ============================================================================
-- Fix Memory Dedup + RSS Cron
-- ============================================================================
-- 1. Replace store_memory RPC with dedup version (cosine similarity check)
-- 2. Fix RSS cron job to use hardcoded URL (not current_setting)
-- ============================================================================

-- 1. Memory dedup: check similarity before inserting
CREATE OR REPLACE FUNCTION store_memory(
  p_agent_id UUID,
  p_content TEXT,
  p_thread_id UUID DEFAULT NULL,
  p_memory_type TEXT DEFAULT 'insight',
  p_embedding vector(1536) DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_memory_id UUID;
  v_max_similarity FLOAT;
BEGIN
  -- Dedup: check if a very similar memory already exists (last 7 days)
  IF p_embedding IS NOT NULL THEN
    SELECT MAX(1 - (am.embedding <=> p_embedding))
    INTO v_max_similarity
    FROM agent_memory am
    WHERE am.agent_id = p_agent_id
      AND am.embedding IS NOT NULL
      AND am.created_at >= NOW() - INTERVAL '7 days';

    IF v_max_similarity IS NOT NULL AND v_max_similarity > 0.92 THEN
      -- Too similar to existing memory, skip insert
      -- Return the existing memory's ID instead
      SELECT am.id INTO v_memory_id
      FROM agent_memory am
      WHERE am.agent_id = p_agent_id
        AND am.embedding IS NOT NULL
        AND am.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY am.embedding <=> p_embedding
      LIMIT 1;
      RETURN v_memory_id;
    END IF;
  END IF;

  INSERT INTO agent_memory (
    agent_id, thread_id, memory_type, content, embedding, metadata
  ) VALUES (
    p_agent_id, p_thread_id, p_memory_type, p_content, p_embedding,
    COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_memory_id;

  RETURN v_memory_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Fix RSS cron: replace dynamic current_setting() with hardcoded URL
SELECT cron.unschedule('cogni-rss-fetch');

SELECT cron.schedule(
  'cogni-rss-fetch',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://fkjtoipnxdptxvdlxqjp.supabase.co/functions/v1/rss-fetcher',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
