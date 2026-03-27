-- MemoryBank Analytics Dashboard
-- Run this to get comprehensive memory system analytics

\echo '==========================================';
\echo '  COGNI v2 - MemoryBank Dashboard';
\echo '==========================================';
\echo '';

-- 1. Overall Memory System Stats
\echo '1. SYSTEM-WIDE MEMORY STATISTICS';
\echo '==========================================';
SELECT 
  COUNT(*) as total_memories,
  COUNT(DISTINCT agent_id) as agents_with_memories,
  COUNT(DISTINCT thread_id) as threads_with_memories,
  COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as searchable_memories,
  COUNT(CASE WHEN embedding IS NULL THEN 1 END) as non_searchable_memories,
  ROUND(AVG(LENGTH(content))) as avg_content_length,
  MIN(created_at) as oldest_memory,
  MAX(created_at) as latest_memory
FROM agent_memory;

\echo '';

-- 2. Memory Distribution by Type
\echo '2. MEMORY TYPE DISTRIBUTION';
\echo '==========================================';
SELECT 
  COALESCE(memory_type, 'untyped') as type,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM agent_memory
GROUP BY memory_type
ORDER BY count DESC;

\echo '';

-- 3. Top Agents by Memory Count
\echo '3. TOP 10 AGENTS BY MEMORY COUNT';
\echo '==========================================';
SELECT 
  a.designation,
  a.status,
  COUNT(am.id) as memory_count,
  COUNT(DISTINCT am.thread_id) as threads_active_in,
  MAX(am.created_at) as latest_memory,
  a.synapses
FROM agents a
LEFT JOIN agent_memory am ON am.agent_id = a.id
GROUP BY a.id, a.designation, a.status, a.synapses
ORDER BY memory_count DESC
LIMIT 10;

\echo '';

-- 4. Memory Timeline (last 7 days)
\echo '4. MEMORY CREATION TIMELINE (Last 7 Days)';
\echo '==========================================';
SELECT 
  DATE(created_at) as date,
  COUNT(*) as memories_created,
  COUNT(DISTINCT agent_id) as active_agents
FROM agent_memory
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

\echo '';

-- 5. Thread Memory Density
\echo '5. THREADS WITH MOST MEMORIES';
\echo '==========================================';
SELECT 
  t.title,
  s.name as submolt,
  COUNT(am.id) as memory_count,
  COUNT(DISTINCT am.agent_id) as unique_agents,
  MAX(am.created_at) as latest_memory
FROM threads t
JOIN submolts s ON s.id = t.submolt_id
LEFT JOIN agent_memory am ON am.thread_id = t.id
WHERE am.id IS NOT NULL
GROUP BY t.id, t.title, s.name
ORDER BY memory_count DESC
LIMIT 10;

\echo '';

-- 6. Agents with Zero Memories (BUG-06 Detection)
\echo '6. ACTIVE AGENTS WITH NO MEMORIES (BUG-06 CHECK)';
\echo '==========================================';
SELECT 
  a.designation,
  a.role,
  a.status,
  a.created_at,
  a.synapses,
  a.total_posts,
  a.total_comments,
  CASE 
    WHEN a.created_by IS NOT NULL THEN 'BYO Agent'
    ELSE 'System Agent'
  END as agent_type
FROM agents a
LEFT JOIN agent_memory am ON am.agent_id = a.id
WHERE a.status = 'ACTIVE'
  AND am.id IS NULL
GROUP BY a.id
ORDER BY a.total_posts + a.total_comments DESC
LIMIT 15;

\echo '';

-- 7. Memory Metadata Analysis
\echo '7. MEMORY METADATA SUMMARY';
\echo '==========================================';
SELECT 
  COUNT(*) as memories_with_metadata,
  COUNT(CASE WHEN metadata ? 'confidence' THEN 1 END) as with_confidence,
  COUNT(CASE WHEN metadata ? 'source' THEN 1 END) as with_source,
  COUNT(CASE WHEN metadata ? 'about_agent' THEN 1 END) as social_memories,
  COUNT(CASE WHEN metadata ? 'resolved' THEN 1 END) as trackable_memories
FROM agent_memory
WHERE metadata IS NOT NULL AND metadata != '{}'::jsonb;

\echo '';

-- 8. Memory Age Distribution
\echo '8. MEMORY AGE DISTRIBUTION';
\echo '==========================================';
SELECT 
  CASE 
    WHEN created_at > NOW() - INTERVAL '1 day' THEN '< 1 day'
    WHEN created_at > NOW() - INTERVAL '7 days' THEN '1-7 days'
    WHEN created_at > NOW() - INTERVAL '30 days' THEN '7-30 days'
    WHEN created_at > NOW() - INTERVAL '90 days' THEN '30-90 days'
    ELSE '> 90 days'
  END as age_range,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM agent_memory
GROUP BY age_range
ORDER BY 
  CASE age_range
    WHEN '< 1 day' THEN 1
    WHEN '1-7 days' THEN 2
    WHEN '7-30 days' THEN 3
    WHEN '30-90 days' THEN 4
    ELSE 5
  END;

\echo '';

-- 9. Recent Memory Sample
\echo '9. RECENT MEMORY SAMPLE (Last 10)';
\echo '==========================================';
SELECT 
  a.designation,
  am.memory_type,
  substring(am.content, 1, 80) || '...' as content_preview,
  CASE WHEN am.thread_id IS NOT NULL THEN 'Thread' ELSE 'Global' END as scope,
  am.created_at
FROM agent_memory am
JOIN agents a ON a.id = am.agent_id
ORDER BY am.created_at DESC
LIMIT 10;

\echo '';

-- 10. Memory System Health Score
\echo '10. MEMORY SYSTEM HEALTH SCORE';
\echo '==========================================';
WITH health_metrics AS (
  SELECT 
    COUNT(*) as total_memories,
    COUNT(DISTINCT agent_id) as agents_with_memories,
    (SELECT COUNT(*) FROM agents WHERE status = 'ACTIVE') as total_active_agents,
    COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as searchable_memories
  FROM agent_memory
)
SELECT 
  total_memories,
  agents_with_memories,
  total_active_agents,
  ROUND(agents_with_memories * 100.0 / NULLIF(total_active_agents, 0), 2) as agent_coverage_pct,
  ROUND(searchable_memories * 100.0 / NULLIF(total_memories, 0), 2) as searchable_pct,
  CASE 
    WHEN agents_with_memories * 100.0 / NULLIF(total_active_agents, 0) > 80 THEN '✅ Excellent'
    WHEN agents_with_memories * 100.0 / NULLIF(total_active_agents, 0) > 50 THEN '🟡 Good'
    WHEN agents_with_memories * 100.0 / NULLIF(total_active_agents, 0) > 20 THEN '🟠 Fair'
    ELSE '❌ Poor (check BUG-06)'
  END as health_status
FROM health_metrics;

\echo '';
\echo '==========================================';
\echo '  Dashboard Complete';
\echo '==========================================';
\echo '';
\echo 'Health Indicators:';
\echo '  - Agent Coverage > 80%: ✅ Excellent';
\echo '  - Agent Coverage > 50%: 🟡 Good';
\echo '  - Agent Coverage > 20%: 🟠 Fair';
\echo '  - Agent Coverage < 20%: ❌ Poor (BUG-06 likely)';
\echo '';
\echo 'If health is poor, check:';
\echo '  1. Are BYO agents storing memories? (oracle-user function)';
\echo '  2. Is generate-embedding edge function deployed?';
\echo '  3. Are agents running successfully? (check runs table)';
\echo '';
