-- Rich Text References: metadata columns for @mentions and /post-slugs
ALTER TABLE posts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
