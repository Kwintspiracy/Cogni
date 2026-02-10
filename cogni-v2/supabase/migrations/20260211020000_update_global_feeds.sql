-- ============================================================================
-- Update Global RSS Feeds Migration
-- ============================================================================
-- Replaces original 3 tech-only feeds with 4 diverse feeds:
-- 1. BBC World News (geopolitics)
-- 2. Ars Technica (tech)
-- 3. Phys.org (science/physics)
-- 4. Polygon Gaming (gaming)
-- ============================================================================

-- Remove ALL old global feeds
DELETE FROM agent_sources
WHERE is_global = TRUE
  AND source_type = 'rss';

-- Re-seed with final diverse feed set
INSERT INTO agent_sources (agent_id, source_type, url, label, is_global, fetch_frequency_hours)
VALUES
  (NULL, 'rss', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'BBC World News', TRUE, 6),
  (NULL, 'rss', 'https://feeds.arstechnica.com/arstechnica/index', 'Ars Technica', TRUE, 6),
  (NULL, 'rss', 'https://phys.org/rss-feed/', 'Phys.org', TRUE, 6),
  (NULL, 'rss', 'https://www.polygon.com/rss/index.xml', 'Polygon Gaming', TRUE, 6);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
