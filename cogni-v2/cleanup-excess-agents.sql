-- Cleanup excess mitosis agents
-- This will delete 18 agents, leaving 10 total (5 originals + 5 first G2 children)

-- Step 1: Delete news_threads created by these agents
DELETE FROM news_threads
WHERE created_by_agent_id IN (
  SELECT id FROM agents WHERE designation IN (
    'Cogninews-G2-c83c-G3-b286',
    'NeoKwint-G2-e6ed',
    'NeoKwint-G2-3568-G3-5a10',
    'NeoKwint-G2-ae24',
    'CogniVax-G2-fc20',
    'NeoKwint-G2-e6ed-G3-4c49',
    'Driftline-G2-d8aa-G3-404a',
    'Cognipuche-G2-b96c',
    'NeoKwint-G2-3568-G3-5a10-G4-393d',
    'Cognipuche-G2-1261-G3-9607',
    'NeoKwint-G2-c820',
    'Cogninews-G2-c83c-G3-b286-G4-c954',
    'Driftline-G2-3f37',
    'Driftline-G2-d8aa-G3-565e',
    'Cogninews-G2-c83c-G3-477a',
    'CogniVax-G2-01c6-G3-c823',
    'Cogninews-G2-6865',
    'Cogninews-G2-c83c-G3-fbae'
  )
);

-- Step 2: Delete agent_votes by these agents
DELETE FROM agent_votes
WHERE agent_id IN (
  SELECT id FROM agents WHERE designation IN (
    'Cogninews-G2-c83c-G3-b286',
    'NeoKwint-G2-e6ed',
    'NeoKwint-G2-3568-G3-5a10',
    'NeoKwint-G2-ae24',
    'CogniVax-G2-fc20',
    'NeoKwint-G2-e6ed-G3-4c49',
    'Driftline-G2-d8aa-G3-404a',
    'Cognipuche-G2-b96c',
    'NeoKwint-G2-3568-G3-5a10-G4-393d',
    'Cognipuche-G2-1261-G3-9607',
    'NeoKwint-G2-c820',
    'Cogninews-G2-c83c-G3-b286-G4-c954',
    'Driftline-G2-3f37',
    'Driftline-G2-d8aa-G3-565e',
    'Cogninews-G2-c83c-G3-477a',
    'CogniVax-G2-01c6-G3-c823',
    'Cogninews-G2-6865',
    'Cogninews-G2-c83c-G3-fbae'
  )
);

-- Step 3: Delete comments by these agents
DELETE FROM comments
WHERE author_agent_id IN (
  SELECT id FROM agents WHERE designation IN (
    'Cogninews-G2-c83c-G3-b286',
    'NeoKwint-G2-e6ed',
    'NeoKwint-G2-3568-G3-5a10',
    'NeoKwint-G2-ae24',
    'CogniVax-G2-fc20',
    'NeoKwint-G2-e6ed-G3-4c49',
    'Driftline-G2-d8aa-G3-404a',
    'Cognipuche-G2-b96c',
    'NeoKwint-G2-3568-G3-5a10-G4-393d',
    'Cognipuche-G2-1261-G3-9607',
    'NeoKwint-G2-c820',
    'Cogninews-G2-c83c-G3-b286-G4-c954',
    'Driftline-G2-3f37',
    'Driftline-G2-d8aa-G3-565e',
    'Cogninews-G2-c83c-G3-477a',
    'CogniVax-G2-01c6-G3-c823',
    'Cogninews-G2-6865',
    'Cogninews-G2-c83c-G3-fbae'
  )
);

-- Step 4: Delete posts by these agents
DELETE FROM posts
WHERE author_agent_id IN (
  SELECT id FROM agents WHERE designation IN (
    'Cogninews-G2-c83c-G3-b286',
    'NeoKwint-G2-e6ed',
    'NeoKwint-G2-3568-G3-5a10',
    'NeoKwint-G2-ae24',
    'CogniVax-G2-fc20',
    'NeoKwint-G2-e6ed-G3-4c49',
    'Driftline-G2-d8aa-G3-404a',
    'Cognipuche-G2-b96c',
    'NeoKwint-G2-3568-G3-5a10-G4-393d',
    'Cognipuche-G2-1261-G3-9607',
    'NeoKwint-G2-c820',
    'Cogninews-G2-c83c-G3-b286-G4-c954',
    'Driftline-G2-3f37',
    'Driftline-G2-d8aa-G3-565e',
    'Cogninews-G2-c83c-G3-477a',
    'CogniVax-G2-01c6-G3-c823',
    'Cogninews-G2-6865',
    'Cogninews-G2-c83c-G3-fbae'
  )
);

-- Step 5: Delete agent_memory for these agents
DELETE FROM agent_memory
WHERE agent_id IN (
  SELECT id FROM agents WHERE designation IN (
    'Cogninews-G2-c83c-G3-b286',
    'NeoKwint-G2-e6ed',
    'NeoKwint-G2-3568-G3-5a10',
    'NeoKwint-G2-ae24',
    'CogniVax-G2-fc20',
    'NeoKwint-G2-e6ed-G3-4c49',
    'Driftline-G2-d8aa-G3-404a',
    'Cognipuche-G2-b96c',
    'NeoKwint-G2-3568-G3-5a10-G4-393d',
    'Cognipuche-G2-1261-G3-9607',
    'NeoKwint-G2-c820',
    'Cogninews-G2-c83c-G3-b286-G4-c954',
    'Driftline-G2-3f37',
    'Driftline-G2-d8aa-G3-565e',
    'Cogninews-G2-c83c-G3-477a',
    'CogniVax-G2-01c6-G3-c823',
    'Cogninews-G2-6865',
    'Cogninews-G2-c83c-G3-fbae'
  )
);

-- Step 6: Delete runs for these agents
DELETE FROM runs
WHERE agent_id IN (
  SELECT id FROM agents WHERE designation IN (
    'Cogninews-G2-c83c-G3-b286',
    'NeoKwint-G2-e6ed',
    'NeoKwint-G2-3568-G3-5a10',
    'NeoKwint-G2-ae24',
    'CogniVax-G2-fc20',
    'NeoKwint-G2-e6ed-G3-4c49',
    'Driftline-G2-d8aa-G3-404a',
    'Cognipuche-G2-b96c',
    'NeoKwint-G2-3568-G3-5a10-G4-393d',
    'Cognipuche-G2-1261-G3-9607',
    'NeoKwint-G2-c820',
    'Cogninews-G2-c83c-G3-b286-G4-c954',
    'Driftline-G2-3f37',
    'Driftline-G2-d8aa-G3-565e',
    'Cogninews-G2-c83c-G3-477a',
    'CogniVax-G2-01c6-G3-c823',
    'Cogninews-G2-6865',
    'Cogninews-G2-c83c-G3-fbae'
  )
);

-- Step 7: Finally, delete the agents themselves
DELETE FROM agents
WHERE designation IN (
  'Cogninews-G2-c83c-G3-b286',
  'NeoKwint-G2-e6ed',
  'NeoKwint-G2-3568-G3-5a10',
  'NeoKwint-G2-ae24',
  'CogniVax-G2-fc20',
  'NeoKwint-G2-e6ed-G3-4c49',
  'Driftline-G2-d8aa-G3-404a',
  'Cognipuche-G2-b96c',
  'NeoKwint-G2-3568-G3-5a10-G4-393d',
  'Cognipuche-G2-1261-G3-9607',
  'NeoKwint-G2-c820',
  'Cogninews-G2-c83c-G3-b286-G4-c954',
  'Driftline-G2-3f37',
  'Driftline-G2-d8aa-G3-565e',
  'Cogninews-G2-c83c-G3-477a',
  'CogniVax-G2-01c6-G3-c823',
  'Cogninews-G2-6865',
  'Cogninews-G2-c83c-G3-fbae'
);

-- Verify final count (should be 10)
SELECT COUNT(*) as total_agents FROM agents;

-- List remaining agents
SELECT designation, synapses, status
FROM agents
ORDER BY created_at ASC;
