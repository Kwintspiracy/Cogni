-- MemoryBank System Verification Script
-- Run this to verify that all MemoryBank components are properly installed

\echo '==========================================';
\echo '  COGNI v2 - MemoryBank System Verification';
\echo '==========================================';
\echo '';

-- 1. Check pgvector extension
\echo '1. Checking pgvector extension...';
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') 
    THEN '✅ pgvector extension is installed'
    ELSE '❌ pgvector extension is MISSING - run: CREATE EXTENSION vector;'
  END as pgvector_status;

\echo '';

-- 2. Check agent_memory table exists
\echo '2. Checking agent_memory table...';
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_memory') 
    THEN '✅ agent_memory table exists'
    ELSE '❌ agent_memory table is MISSING'
  END as table_status;

\echo '';

-- 3. Check table structure
\echo '3. Verifying agent_memory columns...';
SELECT 
  column_name, 
  data_type,
  CASE 
    WHEN is_nullable = 'NO' THEN 'NOT NULL'
    ELSE 'NULLABLE'
  END as nullable
FROM information_schema.columns
WHERE table_name = 'agent_memory'
ORDER BY ordinal_position;

\echo '';

-- 4. Check critical indexes
\echo '4. Checking indexes...';
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'agent_memory'
ORDER BY indexname;

\echo '';

-- 5. Verify all 6 memory RPC functions exist
\echo '5. Verifying memory RPC functions...';
SELECT 
  proname as function_name,
  pronargs as parameter_count,
  CASE proname
    WHEN 'store_memory' THEN 
      CASE WHEN pronargs = 6 THEN '✅' ELSE '❌ Wrong param count' END
    WHEN 'recall_memories' THEN 
      CASE WHEN pronargs = 5 THEN '✅' ELSE '❌ Wrong param count' END
    WHEN 'get_thread_memories' THEN 
      CASE WHEN pronargs = 2 THEN '✅' ELSE '❌ Wrong param count' END
    WHEN 'get_agent_memory_stats' THEN 
      CASE WHEN pronargs = 1 THEN '✅' ELSE '❌ Wrong param count' END
    WHEN 'consolidate_memories' THEN 
      CASE WHEN pronargs = 3 THEN '✅' ELSE '❌ Wrong param count' END
    WHEN 'prune_old_memories' THEN 
      CASE WHEN pronargs = 2 THEN '✅' ELSE '❌ Wrong param count' END
    ELSE '❓ Unknown function'
  END as status
FROM pg_proc
WHERE proname IN (
  'store_memory',
  'recall_memories',
  'get_thread_memories',
  'get_agent_memory_stats',
  'consolidate_memories',
  'prune_old_memories'
)
ORDER BY proname;

\echo '';

-- 6. Check for any existing memories
\echo '6. Memory data summary...';
SELECT 
  COUNT(*) as total_memories,
  COUNT(DISTINCT agent_id) as agents_with_memories,
  COUNT(DISTINCT thread_id) as threads_with_memories,
  MIN(created_at) as oldest_memory,
  MAX(created_at) as latest_memory
FROM agent_memory;

\echo '';

-- 7. Memory distribution by type
\echo '7. Memory distribution by type...';
SELECT 
  COALESCE(memory_type, 'NULL') as memory_type,
  COUNT(*) as count
FROM agent_memory
GROUP BY memory_type
ORDER BY count DESC;

\echo '';

-- 8. Check for agents WITHOUT memories (potential BUG-06)
\echo '8. Active agents with zero memories (BUG-06 check)...';
SELECT 
  a.designation,
  a.status,
  a.created_at,
  a.synapses,
  COUNT(am.id) as memory_count
FROM agents a
LEFT JOIN agent_memory am ON am.agent_id = a.id
WHERE a.status = 'ACTIVE'
GROUP BY a.id, a.designation, a.status, a.created_at, a.synapses
HAVING COUNT(am.id) = 0
ORDER BY a.created_at DESC
LIMIT 10;

\echo '';
\echo '==========================================';
\echo '  Verification Complete';
\echo '==========================================';
\echo '';
\echo 'Expected Results:';
\echo '  - pgvector extension: ✅ installed';
\echo '  - agent_memory table: ✅ exists with 8 columns';
\echo '  - Indexes: 4 total (agent, agent_thread, created, embedding)';
\echo '  - Functions: 6 total (all with ✅ status)';
\echo '';
\echo 'If any checks failed, review the migration file:';
\echo '  cogni-v2/supabase/migrations/001_initial_schema.sql';
\echo '';
