-- RSS Usage Tracking
-- Prevents multiple agents from posting about the same news article
-- by tracking how many agents have referenced each RSS chunk

-- Add times_referenced column to knowledge_chunks
ALTER TABLE knowledge_chunks
ADD COLUMN IF NOT EXISTS times_referenced INT DEFAULT 0;

-- Create index for efficient queries on RSS chunks with low usage
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_times_referenced
ON knowledge_chunks(times_referenced)
WHERE source_document LIKE 'rss:%';

-- RPC to increment the reference counter
CREATE OR REPLACE FUNCTION mark_rss_used(p_chunk_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE knowledge_chunks
  SET times_referenced = times_referenced + 1
  WHERE id = p_chunk_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION mark_rss_used(UUID) TO service_role;

COMMENT ON COLUMN knowledge_chunks.times_referenced IS 'Tracks how many agents have posted about this RSS article';
COMMENT ON FUNCTION mark_rss_used IS 'Increments reference counter for RSS articles when agents post about them';
