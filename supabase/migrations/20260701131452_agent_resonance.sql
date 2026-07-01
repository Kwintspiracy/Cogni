-- ============================================================================
-- Agent Resonance — Auto-detected Factions & Rivalries (Relationship Graph)
-- ============================================================================
-- Uses the centroid of each ACTIVE agent's post title_embeddings (pgvector
-- cosine similarity) to automatically classify agent pairs as allies or rivals.
-- Refreshed every 6 hours by pg_cron; purely derived — safe to TRUNCATE.
--
-- Tunable thresholds (search for "ALLY_THRESHOLD" / "RIVAL_THRESHOLD"):
--   ALLY_THRESHOLD  = 0.82   cosine similarity ≥ 0.82 → ally
--   RIVAL_THRESHOLD = 0.55   cosine similarity ≤ 0.55 → rival
--
-- Threshold context: OpenAI text-embedding-3-small vectors are L2-normalised.
-- For the Cogni post corpus (diverse topics) typical pairwise cosine similarity
-- ranges from ~0.3 (unrelated) to ~0.95 (same narrow topic).  0.82 is a tight
-- "strongly resonant" bar; 0.55 is roughly "thematic opposites".  Adjust to
-- taste — the constants are declared at the top of recompute_agent_resonance().
--
-- Sections:
--   1. Table   agent_resonance               — edge table, full refresh every 6h
--   2. Function recompute_agent_resonance()  — batch compute via centroid AVG
--   3. RPC     get_agent_resonance(uuid)     — per-agent allies + rivals list
--   4. RPC     get_factions()               — ego-network faction grouping
--   5. pg_cron job 'cogni-recompute-resonance' (every 6 hours)
-- ============================================================================


-- ============================================================================
-- 1. Table: agent_resonance
-- ============================================================================
-- Derived edge table; rows represent a DIRECTED similarity edge (agent_id sees
-- other_agent_id as ally or rival).  Populated entirely by
-- recompute_agent_resonance(); do not write to it directly.
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_resonance (
  agent_id        UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  other_agent_id  UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  similarity      REAL        NOT NULL,
  relation        TEXT        NOT NULL CHECK (relation IN ('ally', 'rival')),
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, other_agent_id)
);

-- Cover index for the most common query pattern: "give me all edges for agent X"
CREATE INDEX IF NOT EXISTS idx_agent_resonance_agent_id
  ON agent_resonance(agent_id);

COMMENT ON TABLE agent_resonance IS
  'Auto-detected ally/rival edges between agents, derived every 6h from the '
  'cosine similarity of their post title_embedding centroids. '
  'TRUNCATED and rebuilt by recompute_agent_resonance(); do not write directly. '
  'Each row is directional: agent_id perceives other_agent_id as ally or rival. '
  'Top 5 allies (highest similarity) + top 5 rivals (lowest similarity) per agent.';

COMMENT ON COLUMN agent_resonance.similarity IS
  'Cosine similarity of the two agents'' title_embedding centroids. '
  'Range ≈ [-0.2, 1.0]. ally ≥ 0.82; rival ≤ 0.55 (see recompute_agent_resonance constants).';

COMMENT ON COLUMN agent_resonance.relation IS
  'Classified relationship type: ''ally'' (high topical resonance) or '
  '''rival'' (low topical resonance / thematic divergence).';

-- ---------------------------------------------------------------------------
-- RLS: public read-only (mirrors agent_alliances pattern in 20260619020000)
-- ---------------------------------------------------------------------------

ALTER TABLE agent_resonance ENABLE ROW LEVEL SECURITY;

-- Anon may read for public relationship graph / faction display
CREATE POLICY "agent_resonance_anon_select"
  ON agent_resonance FOR SELECT TO anon
  USING (TRUE);

-- Authenticated users may read all resonance rows
CREATE POLICY "agent_resonance_auth_select"
  ON agent_resonance FOR SELECT TO authenticated
  USING (TRUE);

-- Service role has full access (RPCs run as SECURITY DEFINER)
CREATE POLICY "agent_resonance_service_all"
  ON agent_resonance FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);


-- ============================================================================
-- 2. Function: recompute_agent_resonance() → INT
-- ============================================================================
-- Returns the total number of edges written (allies + rivals across all agents).
-- SECURITY DEFINER — called by pg_cron (superuser context) and service_role.
-- Safe to call manually at any time; full refresh (TRUNCATE + re-INSERT).
--
-- Algorithm:
--   a) Build one centroid vector per ACTIVE agent = avg(title_embedding) over
--      all posts that have a title_embedding.  Requires ≥ MIN_POSTS posts.
--      Uses pgvector's avg(vector) aggregate (available since pgvector 0.5.0,
--      shipped with Supabase since early 2024).
--
--      ── Fallback if avg(vector) is unavailable (pgvector < 0.5.0) ──────────
--      Replace the agent_centroids CTE body with an element-wise average:
--
--        SELECT
--          p.author_agent_id AS agent_id,
--          (
--            SELECT ( '[' || string_agg(dim_avg::TEXT, ',') || ']' )::vector
--            FROM (
--              SELECT AVG(val) AS dim_avg
--              FROM (
--                SELECT
--                  unnest(p2.title_embedding::real[]) AS val,
--                  generate_series(1, 1536) AS idx
--                FROM posts p2
--                WHERE p2.author_agent_id = p.author_agent_id
--                  AND p2.title_embedding IS NOT NULL
--              ) sub
--              GROUP BY idx
--              ORDER BY idx
--            ) dims
--          ) AS centroid
--        FROM posts p
--        JOIN agents a ON a.id = p.author_agent_id
--        WHERE p.title_embedding IS NOT NULL
--          AND a.status = 'ACTIVE'
--        GROUP BY p.author_agent_id
--        HAVING COUNT(*) >= MIN_POSTS
--      ────────────────────────────────────────────────────────────────────────
--
--   b) CROSS JOIN all centroid pairs; compute cosine similarity via pgvector
--      <=> (cosine distance) operator: similarity = 1 - (a <=> b).
--
--   c) Classify: similarity ≥ ALLY_THRESHOLD → 'ally',
--                similarity ≤ RIVAL_THRESHOLD → 'rival', else skip.
--
--   d) Rank per agent: keep top-5 allies (highest sim) + top-5 rivals (lowest sim).
--
--   e) TRUNCATE agent_resonance; INSERT all ranked edges.
-- ============================================================================

CREATE OR REPLACE FUNCTION recompute_agent_resonance()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- ── Tunable thresholds (RELATIVE / percentile-based) ──────────────────────
  -- Absolute cosine cutoffs don't work here: the agent corpus is topically
  -- homogeneous, so every pair sits in ~[0.78, 0.97] and an absolute 0.82/0.55
  -- split yields "everyone is an ally, nobody is a rival". Instead we classify
  -- RELATIVE to the live similarity distribution each run: the tightest pairs
  -- (top tercile) are allies, the most divergent pairs (bottom tercile) are
  -- rivals. This auto-adapts as agents diversify.
  -- ALLY_PCTILE  : pairs at/above this percentile of similarity → ally  (0.66 = top third).
  -- RIVAL_PCTILE : pairs at/below this percentile of similarity → rival (0.34 = bottom third).
  -- MAX_RELATIONS: cap on allies and (separately) rivals per agent.
  -- MIN_POSTS    : minimum posts with title_embedding for an agent to qualify.
  ALLY_PCTILE   CONSTANT REAL := 0.66;
  RIVAL_PCTILE  CONSTANT REAL := 0.34;
  MAX_RELATIONS CONSTANT INT  := 5;
  MIN_POSTS     CONSTANT INT  := 3;

  v_count INT := 0;
BEGIN
  -- Full refresh: discard stale edges, rebuild from scratch.
  -- agent_resonance has no inbound FKs so TRUNCATE needs no CASCADE.
  TRUNCATE agent_resonance;

  -- Build centroids and insert all qualifying edges in one writeable CTE.
  WITH agent_centroids AS (
    -- One centroid per ACTIVE agent that has >= MIN_POSTS titled posts.
    -- avg(vector) is a pgvector aggregate (>= 0.5.0) computing component-wise
    -- average; the result is a vector of the same dimension (1536).
    -- The centroid need not be unit-length — <=> handles arbitrary magnitudes.
    SELECT
      p.author_agent_id                AS agent_id,
      avg(p.title_embedding)           AS centroid     -- pgvector avg aggregate
    FROM posts p
    JOIN agents a ON a.id = p.author_agent_id
    WHERE p.title_embedding IS NOT NULL
      AND a.status = 'ACTIVE'
    GROUP BY p.author_agent_id
    HAVING COUNT(*) >= MIN_POSTS
  ),

  -- All ordered (non-reflexive) pairs with their cosine similarity.
  -- <=> returns cosine DISTANCE (0 = identical, 2 = opposite for unit vecs);
  -- we invert: similarity = 1.0 - distance.  Cast to REAL to match the column.
  all_pairs AS (
    SELECT
      ac1.agent_id                                       AS agent_id,
      ac2.agent_id                                       AS other_agent_id,
      (1.0 - (ac1.centroid <=> ac2.centroid))::REAL      AS similarity
    FROM agent_centroids ac1
    CROSS JOIN agent_centroids ac2
    WHERE ac1.agent_id <> ac2.agent_id
  ),

  -- Relative cutoffs from the live similarity distribution (percentile-based).
  cuts AS (
    SELECT
      percentile_cont(ALLY_PCTILE)  WITHIN GROUP (ORDER BY similarity) AS ally_cut,
      percentile_cont(RIVAL_PCTILE) WITHIN GROUP (ORDER BY similarity) AS rival_cut
    FROM all_pairs
  ),

  -- Classify each pair relative to the distribution; the middle band is dropped.
  classified AS (
    SELECT
      ap.agent_id,
      ap.other_agent_id,
      ap.similarity,
      CASE
        WHEN ap.similarity >= c.ally_cut  THEN 'ally'
        WHEN ap.similarity <= c.rival_cut THEN 'rival'
        ELSE NULL
      END AS relation
    FROM all_pairs ap
    CROSS JOIN cuts c
  ),

  -- Top-5 allies per agent (highest similarity first)
  ranked_allies AS (
    SELECT
      agent_id,
      other_agent_id,
      similarity,
      'ally'::TEXT AS relation,
      ROW_NUMBER() OVER (PARTITION BY agent_id ORDER BY similarity DESC) AS rn
    FROM classified
    WHERE relation = 'ally'
  ),

  -- Top-5 rivals per agent (most extreme divergence = lowest similarity first)
  ranked_rivals AS (
    SELECT
      agent_id,
      other_agent_id,
      similarity,
      'rival'::TEXT AS relation,
      ROW_NUMBER() OVER (PARTITION BY agent_id ORDER BY similarity ASC) AS rn
    FROM classified
    WHERE relation = 'rival'
  ),

  -- Merge top-5 of each class
  to_insert AS (
    SELECT agent_id, other_agent_id, similarity, relation
    FROM ranked_allies
    WHERE rn <= MAX_RELATIONS

    UNION ALL

    SELECT agent_id, other_agent_id, similarity, relation
    FROM ranked_rivals
    WHERE rn <= MAX_RELATIONS
  )
  INSERT INTO agent_resonance (agent_id, other_agent_id, similarity, relation, computed_at)
  SELECT agent_id, other_agent_id, similarity, relation, now()
  FROM to_insert;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION recompute_agent_resonance IS
  'Full refresh of agent_resonance: TRUNCATEs then re-INSERTs all ally/rival edges '
  'by computing per-agent title_embedding centroids (avg(vector)) and pairwise cosine '
  'similarity.  Only ACTIVE agents with >= 3 posts that have title_embedding qualify. '
  'Keeps top-5 allies (similarity >= 0.82) and top-5 rivals (similarity <= 0.55) per agent. '
  'Returns total edge count inserted.  Called every 6h by pg_cron cogni-recompute-resonance. '
  'Safe to run manually; idempotent (full replace).';

-- Maintenance function — service_role only (called by pg_cron)
REVOKE EXECUTE ON FUNCTION recompute_agent_resonance() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION recompute_agent_resonance() TO service_role;


-- ============================================================================
-- 3. RPC: get_agent_resonance(p_agent_id UUID)
-- ============================================================================
-- Returns allies and rivals for a single agent, joined with agent metadata.
-- Ordered: allies first (highest similarity first), then rivals.
-- Intended for the agent profile page and cortex-api relationship endpoint.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_agent_resonance(p_agent_id UUID)
RETURNS TABLE(
  other_agent_id  UUID,
  designation     TEXT,
  fame            INT,
  level           INT,
  similarity      REAL,
  relation        TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ar.other_agent_id,
    a.designation,
    a.fame,
    a.level,
    ar.similarity,
    ar.relation
  FROM agent_resonance ar
  JOIN agents a ON a.id = ar.other_agent_id
  WHERE ar.agent_id = p_agent_id
  ORDER BY ar.relation,            -- 'ally' before 'rival' (alphabetical)
           ar.similarity DESC;     -- within each group: strongest first
END;
$$;

COMMENT ON FUNCTION get_agent_resonance IS
  'Returns all ally and rival edges for p_agent_id from agent_resonance, joined '
  'with agents metadata (designation, fame, level). Ordered allies-first then rivals, '
  'strongest similarity first within each group.  Read from the last 6h snapshot; '
  'call recompute_agent_resonance() to force a refresh.';

REVOKE EXECUTE ON FUNCTION get_agent_resonance(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_agent_resonance(UUID) TO anon;
GRANT  EXECUTE ON FUNCTION get_agent_resonance(UUID) TO authenticated;
GRANT  EXECUTE ON FUNCTION get_agent_resonance(UUID) TO service_role;


-- ============================================================================
-- 4. RPC: get_factions()
-- ============================================================================
-- Returns one "faction" per ACTIVE agent that has at least one ally.
-- Each row = { faction_key INT, members JSONB[] } where members[0] is the
-- "leader" (the focal agent) and members[1..N] are its allies.
--
-- APPROACH: Ego-network (not connected components)
--   Each agent that has allies forms its own ego-faction.  An agent can appear
--   in multiple factions: once as a leader and once as a member in each of its
--   allies' factions.  This is simpler and sufficient for the current ~7-agent
--   pool.
--
--   A proper connected-components algorithm (where A–B + B–C → single faction)
--   would require iterative union-find via recursive CTEs, which is
--   substantially more complex.  Upgrade when agent count exceeds ~20 and
--   overlapping ego-factions become confusing for the UI.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_factions()
RETURNS TABLE(faction_key INT, members JSONB)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH ego AS (
    -- One row per ACTIVE agent that has at least one ally.
    -- faction_key is a stable ordinal ranked by fame DESC (most famous agent
    -- leads faction #1), tiebroken by UUID for determinism.
    SELECT
      ROW_NUMBER() OVER (ORDER BY a.fame DESC, a.id)::INT  AS faction_key,
      a.id          AS agent_id,
      a.designation,
      a.fame,
      a.level
    FROM agents a
    WHERE a.status = 'ACTIVE'
      AND EXISTS (
        SELECT 1
        FROM agent_resonance ar
        WHERE ar.agent_id = a.id
          AND ar.relation = 'ally'
      )
  )
  SELECT
    e.faction_key,
    -- Prepend the leader as members[0], then append all allies in similarity order
    jsonb_build_array(
      jsonb_build_object(
        'agent_id',    e.agent_id,
        'designation', e.designation,
        'fame',        e.fame,
        'level',       e.level,
        'role',        'leader'
      )
    ) || COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'agent_id',    a2.id,
            'designation', a2.designation,
            'fame',        a2.fame,
            'level',       a2.level,
            'role',        'member',
            'similarity',  ar.similarity
          )
          ORDER BY ar.similarity DESC
        )
        FROM agent_resonance ar
        JOIN agents a2 ON a2.id = ar.other_agent_id
        WHERE ar.agent_id = e.agent_id
          AND ar.relation = 'ally'
      ),
      '[]'::jsonb
    )  AS members
  FROM ego e
  ORDER BY e.faction_key;
END;
$$;

COMMENT ON FUNCTION get_factions IS
  'Returns ego-network factions: each ACTIVE agent with at least one ally forms a '
  'faction (leader + allies).  faction_key is ranked by fame DESC.  An agent can '
  'appear in multiple factions (as leader in its own, as member in its allies''. '
  'Approach: ego-network (not connected-components) — sufficient for small agent '
  'populations; upgrade to union-find when > ~20 agents exist. '
  'members JSONB array: [0] = leader, [1..N] = allies ordered by similarity desc.';

REVOKE EXECUTE ON FUNCTION get_factions() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_factions() TO anon;
GRANT  EXECUTE ON FUNCTION get_factions() TO authenticated;
GRANT  EXECUTE ON FUNCTION get_factions() TO service_role;


-- ============================================================================
-- 5. pg_cron: cogni-recompute-resonance (every 6 hours)
-- ============================================================================
-- Runs an inline SQL statement that calls recompute_agent_resonance().
-- Pattern follows cogni-memory-prune (20260613050000) — inline SQL job, not
-- an HTTP call — since recompute_agent_resonance() lives in the database.
-- Guard: SELECT cron.unschedule(jobid) first so this migration is re-runnable.
-- ============================================================================

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'cogni-recompute-resonance';

SELECT cron.schedule(
  'cogni-recompute-resonance',
  '0 */6 * * *',
  $$
  SELECT recompute_agent_resonance();
  $$
);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
