# Gulit Ingestion Service (`/ingest`)

Telethon-based Telegram MTProto ingestion pipeline with album debouncing, raw message capture, media upload to Cloudflare R2, and resumable historical backfill.

## Architectural Guarantees

1. **Zero Processing / Raw In, Raw Stored**: Captures messages into `raw_messages` completely untouched. No parsing, no regex, no LLMs.
2. **Album Grouping**: Buffers multi-photo/media posts on a 3-second debounce keyed by `grouped_id`. Multi-photo albums collapse into a single row with all media references attached.
3. **Session Persistence**: Telethon session SQLite files are saved in `/data/sessions` (mounted to `./sessions` on the host), surviving Docker container restarts without re-authenticating.
4. **Immediate Media Download**: Telegram media file references expire; raw bytes are downloaded immediately to Cloudflare R2 (or local fallback) and the persistent storage key is stored in `raw_messages.media_refs`.
5. **FloodWait Resiliency**: Catches `telethon.errors.FloodWaitError` on every MTProto call, sleeps the requested duration plus safety buffer, and resumes without burning rate limits.
6. **Resumable Backfill & Idempotency**: Backfill tracks `channels.last_message_id` and uses `ON CONFLICT (channel_id, message_id) DO UPDATE` to guarantee zero duplicate rows across re-runs.
7. **Dynamic Allowlist**: Ingested channels are read from the PostgreSQL `channels` table (`WHERE active = TRUE`) and refreshed dynamically.

---

## Directory Structure

```
ingest/
├── __init__.py
├── config.py           # Pydantic Settings loaded from .env / environment
├── db.py               # Async PostgreSQL client using psycopg v3 (connection pooling)
├── client.py           # Telethon MTProto client with interactive auth & media download
├── debouncer.py        # 3-second AlbumDebouncer keyed by (channel_id, grouped_id)
├── storage.py          # Cloudflare R2, S3, Local, and Mock media storage backends
├── flood_wait.py       # FloodWaitError handler and async decorator
├── listener.py         # Live NewMessage event listener daemon
├── backfill.py         # Resumable historical backfill engine
├── logging_utils.py    # Structured JSON & Pretty logger
└── cli.py              # CLI entrypoint (auth, listen, backfill, status, seed-channels)
```

---

## Quick Start

### 1. Environment Setup

Copy `.env.example` to `.env.local` or `.env` and fill in your values:

```bash
cp .env.example .env.local
```

Key environment variables:
- `DATABASE_URL`: PostgreSQL connection string (`postgresql://guilit:guilit@localhost:5432/guilit`)
- `TELEGRAM_API_ID`: Obtained from [my.telegram.org](https://my.telegram.org)
- `TELEGRAM_API_HASH`: Obtained from [my.telegram.org](https://my.telegram.org)
- `TELEGRAM_PHONE`: Burner phone number (e.g. `+251911000000`)
- `STORAGE_BACKEND`: `r2` (Cloudflare R2) or `local` (saves to `./data/media`)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`

### 2. Interactive Telegram Auth (Burner Number)

Run the interactive auth routine once to authenticate your burner account and persist the `.session` file:

```bash
python -m ingest.cli auth --phone +251911000000
```
Enter the login code received on Telegram (and 2FA password if enabled). The session is saved to `./sessions/guilit_ingest.session`.

### 3. Seed / Sync Channels Allowlist

Sync the initial allowlist of channels into Postgres:

```bash
python -m ingest.cli seed-channels
```

### 4. Run Historical Backfill

To backfill all allowlisted channels over the last 7 days:
```bash
python -m ingest.cli backfill --since 7d
```

To backfill a specific channel:
```bash
python -m ingest.cli backfill --channel addis_used_market --since 30d
```

To run a full historical backfill with a message limit:
```bash
python -m ingest.cli backfill --limit 500
```

### 5. Run Live Ingestion Listener Daemon

Start capturing live messages from all allowlisted channels:
```bash
python -m ingest.cli listen
```

### 6. View Ingestion Status & Statistics

Check channel status, message counts, and last captured IDs:
```bash
python -m ingest.cli status
```

---

## Docker Deployment

Start the database and live listener with persistent session volume:

```bash
docker compose up -d db ingest-listener
```

Run a one-off backfill inside Docker:

```bash
docker compose run --rm ingest-backfill
```

---

## Running Tests

Run the test suite:

```bash
pytest -v
```
