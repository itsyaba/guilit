# Database Schema

Drizzle is the single source of truth for the Postgres schema. The Python ingest service reads and writes directly against the same tables using plain `psycopg`; it has no ORM and no generated types — the contract is the SQL schema defined here.

## Quick start

```bash
# 1. Spin up Postgres (includes pg_trgm, unaccent, pgvector)
docker run -d \
  --name guilit-db \
  -e POSTGRES_USER=guilit \
  -e POSTGRES_PASSWORD=guilit \
  -e POSTGRES_DB=guilit \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# 2. Copy the example env and fill in your DATABASE_URL
cp .env.example .env.local

# 3. Enable extensions (run once per fresh database)
psql $DATABASE_URL -f db/migrations/0000_extensions.sql

# 4. Push schema
npm run db:push
```

---

## Why each table exists

### `channels`
The allowlisted Telegram channels we ingest from. `last_message_id` enables **resumable backfill**: the listener stores the highest message ID it has seen and resumes from there on restart. A crashed worker never re-fetches the full history.

### `raw_messages`
Every Telegram message captured verbatim **before any processing**. This is the foundation of the whole pipeline:
- Extraction logic will be wrong on day 3 and right on day 9. Tuning the prompt, adding categories, fixing Amharic phrasing — each change becomes a local batch re-run rather than a re-scrape.
- Splits failure domains: the listener does one dumb fast thing (insert and move on). If Gemini is down or extraction fails, capture keeps running and nothing is lost.
- The moderator dashboard shows the original message beside the extracted fields.

The `(channel_id, message_id)` unique index is critical: the ingest worker can crash halfway and re-run safely — inserting the same message twice is a no-op.

### `extractions`
Structured fields produced by the Gemini extraction pipeline, versioned by `prompt_version`. When we retune the prompt or add categories we write new rows rather than overwriting, so before/after comparisons are always available in the moderator dashboard.

Phone numbers are normalised to `+251...` on write. PII is stripped from the text sent to Gemini (phone numbers replaced with `[PHONE_1]`) and reattached from `phone_normalized` here.

### `listings`
The canonical deduplicated entity that buyers see. One listing = one real-world physical item. Multiple Telegram posts of the same item are collapsed here; the dedup cluster is in `listing_sources`.

Key design choices:
- **Price as integer ETB.** No floats, no currency column.
- **`seller_id` is nullable.** Indexed (scraped) listings have no user attached until the owner claims the listing via OTP.
- **`status` not `deleted_at`.** Never hard-delete rows. On removal requests set `status = 'removed'` to satisfy right-to-erasure requirements under Proclamation 1321/2024 while keeping the audit trail.
- **Generated `search_vector` column.** A `tsvector` generated from title (EN + AM) + description + location, indexed with GIN. The `simple` dictionary config avoids language-specific stemming that would mangle Amharic.
- **`embedding vector(768)`.** Text-embedding-004 embedding for semantic dedup and approximate nearest-neighbour search via pgvector HNSW index.
- **`title_en` pg_trgm GIN index.** Fuzzy/prefix matching for typos and transliteration variants.

### `listing_sources`
The dedup cluster join table. Maps many `raw_messages` → one `listing`. This is what makes "Seen in 4 channels · lowest 8,500 ETB" possible: each row is one channel's post of the same physical item.

The unique constraint on `(listing_id, raw_message_id)` makes re-running the dedup pipeline idempotent.

### `images`
Photos stored in Cloudflare R2. `r2_key` is the stable identifier for CDN URL construction — no full URLs stored so switching storage is a config change, not a migration. `phash` (perceptual hash) is one of three dedup signals alongside phone number match and embedding similarity.

### `users`
Created at claim time or native post time — never for scraped-only listings. The primary acquisition path is claiming: the seller receives an OTP on the phone number already in the listing, proving ownership without paperwork.

### `categories`
Bilingual taxonomy with optional two-level hierarchy (parent self-reference). The `slug` is the stable identifier imported by the web app and the extraction pipeline. Changing a slug is a breaking change; prefer retiring slugs by removing them from active use.

### `jobs`
**Postgres-native job queue** — no Redis. `SELECT ... FOR UPDATE SKIP LOCKED` provides mutual exclusion without an extra service. At our scale this is strictly better: one fewer container, one fewer failure domain, and the queue state is queryable with plain SQL.

`run_after` enables delayed jobs and exponential backoff: on a Gemini 429 error, set `run_after = NOW() + interval '2^attempts minutes'` and `status = 'pending'`. The daily-cap reset is transparent to the pipeline — the job simply waits.

### `reports`
User-submitted flags. Reporter is nullable so anonymous reports are accepted. Trust-and-safety rule: 3+ reports → auto-hide + queue for moderator review. Never delete report rows — they feed the scam-signal classifier.

### `ratings`
Buyer-to-seller scores (1–5 integer, no half-stars). Tied to a specific listing so the review has context. Unique on `(seller_id, rater_id, listing_id)` to prevent ballot stuffing.

### `saved_searches`
Stores a serialised `ListingQuery` JSON per user. The ingestion pipeline checks every incoming listing against active saved searches and sends a Telegram ping within minutes of a match. This is the feature only our architecture can deliver — Jiji sees only their own listings, the channels have no search.

---

## Extensions

Three Postgres extensions are required. All are pre-installed in the `pgvector/pgvector:pg16` Docker image.

| Extension | Purpose |
|---|---|
| `pg_trgm` | Trigram GIN index on `listings.title_en` for fuzzy/prefix search |
| `unaccent` | Accent-insensitive normalisation for bilingual search |
| `vector` | pgvector: `vector(768)` column + HNSW index on `listings.embedding` |

Run `db/migrations/0000_extensions.sql` once against a fresh database before `drizzle-kit push`.

---

## Indexes summary

| Table | Index | Type | Purpose |
|---|---|---|---|
| `raw_messages` | `(channel_id, message_id)` | unique | Backfill idempotency |
| `listings` | `search_vector` | GIN | Full-text search |
| `listings` | `title_en gin_trgm_ops` | GIN | Fuzzy/prefix matching |
| `listings` | `embedding` | HNSW | Semantic search + dedup |
| `listings` | `price_etb` | B-tree | Price filter + sort |
| `listings` | `category_slug` | B-tree | Category filter |
| `listings` | `location_area` | B-tree | Location filter |
| `listings` | `(status, tier)` | B-tree | Feed query |
| `listing_sources` | `(listing_id, raw_message_id)` | unique | Dedup idempotency |
| `images` | `phash` | B-tree | Perceptual hash dedup |
| `jobs` | `(status, run_after)` | B-tree | Worker poll query |
| `ratings` | `(seller_id, rater_id, listing_id)` | unique | Anti-stuffing |

---

## Scale ceiling (document in public README)

Postgres FTS + pg_trgm handles our language and volume. Past ~100k listings we'd move to a dedicated search index (Meilisearch or Typesense). The single scraper account becomes a session pool past significant channel counts. Both are documented; neither is needed for the sprint.
