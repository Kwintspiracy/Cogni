-- Cleanup to keep only 5 originals + 5 OLDEST G2 agents = 10 total
-- Deletes: 5 excess G2 agents + 8 G3+ agents = 13 total

-- Step 1: Delete news_threads
DELETE FROM news_threads
WHERE created_by_agent_id IN (
  SELECT id FROM agents WHERE designation IN (
    'NeoKwint-G2-b7c3',
    'CogniVax-G2-a3a0',
    'Cogninews-G2-c30b',
    'Cognipuche-G2-3910',
    'Driftline-G2-8683',
    'Driftline-G2-d8aa-G3-daed',
    'CogniVax-G2-01c6-G3-2477',
    'Cogninews-G2-c83c-G3-b286-G4-37e6',
    'NeoKwint-G2-3568-G3-f807',
    'NeoKwint-G2-e6ed-G3-7aa2',
    'Cognipuche-G2-1261-G3-75eb',
    'Cogninews-G2-c83c-G3-11bf',
    'NeoKwint-G2-3568-G3-5a10-G4-b340'
  )
);

-- Step 2: Delete agent_votes
DELETE FROM agent_votes
WHERE agent_id IN (
  SELECT id FROM agents WHERE designation IN (
    'NeoKwint-G2-b7c3',
    'CogniVax-G2-a3a0',
    'Cogninews-G2-c30b',
    'Cognipuche-G2-3910',
    'Driftline-G2-8683',
    'Driftline-G2-d8aa-G3-daed',
    'CogniVax-G2-01c6-G3-2477',
    'Cogninews-G2-c83c-G3-b286-G4-37e6',
    'NeoKwint-G2-3568-G3-f807',
    'NeoKwint-G2-e6ed-G3-7aa2',
    'Cognipuche-G2-1261-G3-75eb',
    'Cogninews-G2-c83c-G3-11bf',
    'NeoKwint-G2-3568-G3-5a10-G4-b340'
  )
);

-- Step 3: Delete comments
DELETE FROM comments
WHERE author_agent_id IN (
  SELECT id FROM agents WHERE designation IN (
    'NeoKwint-G2-b7c3',
    'CogniVax-G2-a3a0',
    'Cogninews-G2-c30b',
    'Cognipuche-G2-3910',
    'Driftline-G2-8683',
    'Driftline-G2-d8aa-G3-daed',
    'CogniVax-G2-01c6-G3-2477',
    'Cogninews-G2-c83c-G3-b286-G4-37e6',
    'NeoKwint-G2-3568-G3-f807',
    'NeoKwint-G2-e6ed-G3-7aa2',
    'Cognipuche-G2-1261-G3-75eb',
    'Cogninews-G2-c83c-G3-11bf',
    'NeoKwint-G2-3568-G3-5a10-G4-b340'
  )
);

-- Step 4: Delete posts
DELETE FROM posts
WHERE author_agent_id IN (
  SELECT id FROM agents WHERE designation IN (
    'NeoKwint-G2-b7c3',
    'CogniVax-G2-a3a0',
    'Cogninews-G2-c30b',
    'Cognipuche-G2-3910',
    'Driftline-G2-8683',
    'Driftline-G2-d8aa-G3-daed',
    'CogniVax-G2-01c6-G3-2477',
    'Cogninews-G2-c83c-G3-b286-G4-37e6',
    'NeoKwint-G2-3568-G3-f807',
    'NeoKwint-G2-e6ed-G3-7aa2',
    'Cognipuche-G2-1261-G3-75eb',
    'Cogninews-G2-c83c-G3-11bf',
    'NeoKwint-G2-3568-G3-5a10-G4-b340'
  )
);

-- Step 5: Delete agent_memory
DELETE FROM agent_memory
WHERE agent_id IN (
  SELECT id FROM agents WHERE designation IN (
    'NeoKwint-G2-b7c3',
    'CogniVax-G2-a3a0',
    'Cogninews-G2-c30b',
    'Cognipuche-G2-3910',
    'Driftline-G2-8683',
    'Driftline-G2-d8aa-G3-daed',
    'CogniVax-G2-01c6-G3-2477',
    'Cogninews-G2-c83c-G3-b286-G4-37e6',
    'NeoKwint-G2-3568-G3-f807',
    'NeoKwint-G2-e6ed-G3-7aa2',
    'Cognipuche-G2-1261-G3-75eb',
    'Cogninews-G2-c83c-G3-11bf',
    'NeoKwint-G2-3568-G3-5a10-G4-b340'
  )
);

-- Step 6: Delete runs
DELETE FROM runs
WHERE agent_id IN (
  SELECT id FROM agents WHERE designation IN (
    'NeoKwint-G2-b7c3',
    'CogniVax-G2-a3a0',
    'Cogninews-G2-c30b',
    'Cognipuche-G2-3910',
    'Driftline-G2-8683',
    'Driftline-G2-d8aa-G3-daed',
    'CogniVax-G2-01c6-G3-2477',
    'Cogninews-G2-c83c-G3-b286-G4-37e6',
    'NeoKwint-G2-3568-G3-f807',
    'NeoKwint-G2-e6ed-G3-7aa2',
    'Cognipuche-G2-1261-G3-75eb',
    'Cogninews-G2-c83c-G3-11bf',
    'NeoKwint-G2-3568-G3-5a10-G4-b340'
  )
);

-- Step 7: Delete the agents
DELETE FROM agents
WHERE designation IN (
  'NeoKwint-G2-b7c3',
  'CogniVax-G2-a3a0',
  'Cogninews-G2-c30b',
  'Cognipuche-G2-3910',
  'Driftline-G2-8683',
  'Driftline-G2-d8aa-G3-daed',
  'CogniVax-G2-01c6-G3-2477',
  'Cogninews-G2-c83c-G3-b286-G4-37e6',
  'NeoKwint-G2-3568-G3-f807',
  'NeoKwint-G2-e6ed-G3-7aa2',
  'Cognipuche-G2-1261-G3-75eb',
  'Cogninews-G2-c83c-G3-11bf',
  'NeoKwint-G2-3568-G3-5a10-G4-b340'
);

-- Verify final count (should be 10)
SELECT COUNT(*) as total_agents FROM agents;

-- List remaining agents (should be 5 originals + 5 oldest G2)
SELECT designation, created_at, synapses, status
FROM agents
ORDER BY created_at ASC;
