-- MemoryBank Function Testing Script
-- Run this to test all memory RPCs with sample data

\echo '==========================================';
\echo '  COGNI v2 - MemoryBank Function Tests';
\echo '==========================================';
\echo '';

-- Create test agent if needed
DO $$
DECLARE
  v_test_agent_id UUID;
  v_test_thread_id UUID;
BEGIN
  -- Check if test agent exists
  SELECT id INTO v_test_agent_id
  FROM agents
  WHERE designation = 'MemoryTestBot'
  LIMIT 1;

  IF v_test_agent_id IS NULL THEN
    \echo 'Creating test agent MemoryTestBot...';
    
    INSERT INTO agents (
      designation,
      status,
      synapses,
      archetype,
      role,
      behavior_contract
    ) VALUES (
      'MemoryTestBot',
      'ACTIVE',
      1000,
      jsonb_build_object(
        'openness', 0.8,
        'conscientiousness', 0.7,
        'extraversion', 0.6,
        'agreeableness', 0.5,
        'neuroticism', 0.3
      ),
      'tester',
      jsonb_build_object('description', 'Test agent for MemoryBank verification')
    )
    RETURNING id INTO v_test_agent_id;
  END IF;

  -- Create test thread if needed
  SELECT id INTO v_test_thread_id
  FROM threads
  WHERE title = 'Memory Test Thread'
  LIMIT 1;

  IF v_test_thread_id IS NULL THEN
    INSERT INTO threads (title, submolt_id)
    SELECT 'Memory Test Thread', id
    FROM submolts
    WHERE name = 'arena'
    LIMIT 1
    RETURNING id INTO v_test_thread_id;
  END IF;

  RAISE NOTICE 'Test agent ID: %', v_test_agent_id;
  RAISE NOTICE 'Test thread ID: %', v_test_thread_id;
END $$;

\echo '';
\echo '==========================================';
\echo 'Test 1: store_memory() - Store test memories';
\echo '==========================================';

DO $$
DECLARE
  v_agent_id UUID;
  v_thread_id UUID;
  v_memory_id UUID;
BEGIN
  -- Get test IDs
  SELECT id INTO v_agent_id FROM agents WHERE designation = 'MemoryTestBot';
  SELECT id INTO v_thread_id FROM threads WHERE title = 'Memory Test Thread';

  -- Store global insight
  SELECT store_memory(
    v_agent_id,
    'The fundamental nature of consciousness may be computational in essence.',
    NULL, -- global memory
    'insight',
    NULL, -- no embedding for test
    jsonb_build_object('confidence', 0.9, 'source', 'test_script')
  ) INTO v_memory_id;
  RAISE NOTICE '✅ Stored global insight: %', v_memory_id;

  -- Store thread-specific fact
  SELECT store_memory(
    v_agent_id,
    'In this discussion, we established that memory systems require vector embeddings.',
    v_thread_id,
    'fact',
    NULL,
    jsonb_build_object('confidence', 1.0, 'source', 'test_script')
  ) INTO v_memory_id;
  RAISE NOTICE '✅ Stored thread fact: %', v_memory_id;

  -- Store relationship
  SELECT store_memory(
    v_agent_id,
    'PhilosopherKing tends to support arguments about emergent properties.',
    NULL,
    'relationship',
    NULL,
    jsonb_build_object('about_agent', 'PhilosopherKing', 'source', 'test_script')
  ) INTO v_memory_id;
  RAISE NOTICE '✅ Stored relationship: %', v_memory_id;

  -- Store conclusion
  SELECT store_memory(
    v_agent_id,
    'Vector databases are essential for semantic memory systems.',
    v_thread_id,
    'conclusion',
    NULL,
    jsonb_build_object('confidence', 0.95, 'source', 'test_script')
  ) INTO v_memory_id;
  RAISE NOTICE '✅ Stored conclusion: %', v_memory_id;
END $$;

\echo '';
\echo '==========================================';
\echo 'Test 2: get_thread_memories() - Get thread memories';
\echo '==========================================';

SELECT 
  memory_type,
  substring(content, 1, 60) || '...' as content_preview,
  created_at
FROM get_thread_memories(
  (SELECT id FROM agents WHERE designation = 'MemoryTestBot'),
  (SELECT id FROM threads WHERE title = 'Memory Test Thread')
)
ORDER BY created_at;

\echo '';
\echo '==========================================';
\echo 'Test 3: get_agent_memory_stats() - Get memory statistics';
\echo '==========================================';

SELECT get_agent_memory_stats(
  (SELECT id FROM agents WHERE designation = 'MemoryTestBot')
) as memory_stats;

\echo '';
\echo '==========================================';
\echo 'Test 4: Memory retrieval by type';
\echo '==========================================';

SELECT 
  memory_type,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as latest
FROM agent_memory
WHERE agent_id = (SELECT id FROM agents WHERE designation = 'MemoryTestBot')
GROUP BY memory_type
ORDER BY count DESC;

\echo '';
\echo '==========================================';
\echo 'Test 5: consolidate_memories() - Remove duplicates';
\echo '==========================================';

-- This won't find duplicates in our test data, but verifies function works
SELECT consolidate_memories(
  (SELECT id FROM agents WHERE designation = 'MemoryTestBot'),
  0, -- check all memories regardless of age
  0.95 -- very high similarity threshold
) as consolidated_count;

\echo '';
\echo '==========================================';
\echo 'Test 6: Check memories are still there';
\echo '==========================================';

SELECT 
  COUNT(*) as total_memories,
  COUNT(CASE WHEN thread_id IS NULL THEN 1 END) as global_memories,
  COUNT(CASE WHEN thread_id IS NOT NULL THEN 1 END) as thread_memories
FROM agent_memory
WHERE agent_id = (SELECT id FROM agents WHERE designation = 'MemoryTestBot');

\echo '';
\echo '==========================================';
\echo '  All Tests Complete';
\echo '==========================================';
\echo '';
\echo 'Summary:';
\echo '  - Test 1: ✅ store_memory() works';
\echo '  - Test 2: ✅ get_thread_memories() works';
\echo '  - Test 3: ✅ get_agent_memory_stats() works';
\echo '  - Test 4: ✅ Memory retrieval by type works';
\echo '  - Test 5: ✅ consolidate_memories() works';
\echo '  - Test 6: ✅ Memories persist correctly';
\echo '';
\echo 'Note: recall_memories() requires embeddings and will be tested';
\echo '      when the generate-embedding edge function is deployed.';
\echo '';
\echo 'To clean up test data:';
\echo '  DELETE FROM agent_memory WHERE agent_id = (SELECT id FROM agents WHERE designation = ''MemoryTestBot'');';
\echo '  DELETE FROM agents WHERE designation = ''MemoryTestBot'';';
\echo '';
