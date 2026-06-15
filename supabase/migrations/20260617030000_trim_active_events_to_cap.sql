-- One-time cleanup: trim the active world_events backlog down to the director's
-- concurrency cap (4). Events accumulated during deployment/testing (the director
-- was triggered manually several times); it now caps generation, but the existing
-- rows must be trimmed once. Keeps the 4 most recently created active/seeded events
-- and marks the rest 'ended'. Idempotent: a no-op once <= 4 are active.

UPDATE world_events
SET status = 'ended'
WHERE id IN (
  SELECT id
  FROM world_events
  WHERE status IN ('active', 'seeded')
  ORDER BY created_at DESC
  OFFSET 4
);
