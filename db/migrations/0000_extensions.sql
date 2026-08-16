-- Enable the three Postgres extensions required by the schema.
-- Run this once against a fresh database before `drizzle-kit push`.
--
-- The pgvector/pgvector:pg16 Docker image ships with all three pre-built.
-- On a plain postgres:16 image you need to install the shared library first:
--   apt-get install -y postgresql-16-pgvector
--
-- Run: psql $DATABASE_URL -f db/migrations/0000_extensions.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- trigram fuzzy matching on title
CREATE EXTENSION IF NOT EXISTS unaccent;   -- accent-insensitive search normalisation
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector: 768-dim embedding column + HNSW index

-- Verify all three loaded successfully
SELECT extname, extversion
FROM pg_extension
WHERE extname IN ('pg_trgm', 'unaccent', 'vector')
ORDER BY extname;
