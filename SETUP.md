# Gulit — Setup & Testing Guide

Where every environment variable comes from, and how to verify the project
actually works. `README.md` is the product brief; this is the operations
manual.

Everything below was run against this repo on 2026-08-20. Commands that are
quoted with output are commands that were actually executed, not illustrations.

---

## 1. Quick start (already-provisioned machine)

```bash
make dev        # docker compose up -d postgres  +  npm run dev
```

Open <http://localhost:3000/browse>. Browsing, search, filters, listing pages
and price fairness all work with **zero credentials** — no Telegram account, no
Gemini key, no Cloudflare account.

Credentials are only needed for the three auth-gated flows (login, posting,
claiming) and for live Telegram ingestion. See §4.

---

## 2. Prerequisites

| Tool | Version used | Notes |
| --- | --- | --- |
| Node | v22.22.2 | Next.js 16.2.6 / React 19.2.4 |
| Docker + compose | 29.4.2 | Postgres runs in a container, app does not |
| Python | 3.14 (in `.venv`) | ingest service |

First-time provisioning from a fresh clone:

```bash
npm install

python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt

cp .env.example .env.local          # then fill in per §3/§4
docker compose up -d postgres
npm run db:push                     # drizzle-kit push — creates the 19 tables
```

The Postgres image is `pgvector/pgvector:pg16`. Verify the extensions the
search layer depends on:

```bash
make check-extensions               # expects vector, pg_trgm, unaccent
```

---

## 3. The three env files, and which one wins

This trips people up, so it is worth being precise. There is no single env
file — there are three consumers with three different loading rules.

| Reader | Files read | Precedence |
| --- | --- | --- |
| `docker compose` | **`.env` only** | n/a — never reads `.env.local` |
| Next.js | `.env`, then `.env.local` | `.env.local` **wins** |
| ingest (Python) | `ingest/config.py` sets `env_file=(".env", ".env.local")` | `.env.local` **wins** |

Practical consequence: values needed by `make up` / `make prod-up` must live in
`.env`, because compose interpolates `${VAR}` from that file alone. Values you
want to differ per-developer go in `.env.local`.

Both `.env` and `.env.local` are gitignored (`.gitignore:32-33`). `.env.example`
is the committed template. **Never commit a real secret to `.env.example`.**

### Empty string ≠ unset

`ingest/config.py` uses pydantic-settings. An empty assignment is a *value*, not
an absence:

```
TELEGRAM_API_ID=
```

`TELEGRAM_API_ID` is typed `Optional[int]` (`ingest/config.py:33`), so the empty
string fails validation and **every** `ingest.cli` command dies before it starts:

```
pydantic_core._pydantic_core.ValidationError: 1 validation error for Settings
TELEGRAM_API_ID
  Input should be a valid integer, unable to parse string as an integer
```

Leave integer-typed optionals **commented out**, not blank. String-typed
optionals (`TELEGRAM_API_HASH`, `R2_*`, `GEMINI_API_KEY`) are safe to leave
blank — the code treats `""` as falsy.

---

## 4. Environment variable reference

### 4.1 Required — the app throws without these

| Var | Where to get it | Consumed at |
| --- | --- | --- |
| `DATABASE_URL` | Nothing external. Points at the local container; must agree with the four `POSTGRES_*` values that create it. | `db/client.ts:5` throws if unset |
| `SESSION_SECRET` | Generate: `openssl rand -hex 32` | `lib/session.ts:19`; line 20 throws if unset |

`SESSION_SECRET` signs the `gl_session` JWT (HS256, 30-day expiry). Sessions are
stateless — there is no session table — so rotating this value logs every user
out. Keep it stable across restarts and deploys.

```bash
POSTGRES_USER=guilit
POSTGRES_PASSWORD=guilit
POSTGRES_DB=guilit
POSTGRES_PORT=5432
DATABASE_URL=postgresql://guilit:guilit@localhost:5432/guilit
SESSION_SECRET=<openssl rand -hex 32>
```

Inside containers, `docker-compose.yml:34` rewrites the host from `localhost` to
`postgres`. Use the `localhost` form in your env files — that is what `make dev`,
`drizzle-kit`, and `./.venv/bin/python -m ingest.cli` need.

### 4.2 Telegram Login Widget — needed for login, posting, claiming

**Source: [@BotFather](https://t.me/BotFather) in any Telegram client.**

1. `/newbot` → give it a display name and a username ending in `bot`.
2. BotFather prints a token like `123456789:AAH...` → `TELEGRAM_BOT_TOKEN`
3. The bot's `@handle`, without the `@` → `TELEGRAM_BOT_USERNAME`
4. `/setdomain` → select the bot → send the **host** of `NEXT_PUBLIC_APP_URL`.

```bash
TELEGRAM_BOT_TOKEN=123456789:AAH...
TELEGRAM_BOT_USERNAME=my_gulit_bot
NEXT_PUBLIC_APP_URL=https://<your-tunnel-host>
```

**`localhost` will not work.** BotFather refuses `localhost` for `/setdomain`, and
the widget refuses to complete auth against a domain the bot does not own. To
test login locally you need a public HTTPS host:

```bash
cloudflared tunnel --url http://localhost:3000
# → https://random-words-1234.trycloudflare.com
```

Then `/setdomain` that host **and** set `NEXT_PUBLIC_APP_URL` to it, then restart
the dev server (Next reads env files only at boot).

A wrong or placeholder token is not a soft degradation. `verifyTelegramAuth`
(`lib/telegram-auth.ts:29`) HMACs the payload with `sha256(bot_token)` as the
key; a mismatched token changes the digest completely and
`app/api/auth/telegram/callback/route.ts:23` redirects to
`/login?error=invalid_auth` every time.

> The committed `.env.local` currently holds
> `TELEGRAM_BOT_TOKEN=123456:test-bot-token-for-local-dev-only`, which is a
> placeholder. Login is expected to fail until you replace it.

### 4.3 Admin access

```bash
ADMIN_TELEGRAM_USERNAME=your_handle   # your Telegram @handle, "@" optional
ADMIN_PHONE=+251911000000             # your phone, normalised +251XXXXXXXXX
```

Either variable promotes the matching account on its next request.

**Use `ADMIN_TELEGRAM_USERNAME` for a Telegram login.** The Login Widget payload
carries `username` but no phone number, so a user who has only ever logged in
has `phone = NULL`. Matching is case-insensitive and a leading `@` is optional.

`ADMIN_PHONE` is matched against `users.phone`, which is written in exactly one
place — the OTP claim at `app/api/listings/[id]/claim/verify/route.ts:83`. It
therefore fires only *after* you have claimed a listing, not on a fresh login.
Both live in `getSessionUser()` (`lib/session.ts`).

To promote anyone else:

```bash
docker compose exec -T postgres psql -U guilit -d guilit \
  -c "UPDATE users SET is_admin = true WHERE username = 'your_tg_handle';"
```

`/admin` returns **403** for a logged-in non-admin and is guarded by
`requireAdmin()` (`lib/session.ts:116`).

### 4.4 Telegram MTProto — live channel ingestion (optional)

**Source: <https://my.telegram.org>**

1. Log in with a phone number. **Use a burner** — this account joins the
   channels being read.
2. "API development tools" → create an app (any title/shortname).
3. Copy `api_id` (integer) and `api_hash` (32 hex chars).
4. `npm run ingest:auth` → enter the login code Telegram sends. This writes
   `./sessions/guilit_ingest.session`; do it once per machine.

```bash
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=<32 hex chars>
TELEGRAM_PHONE=+251911000000
TELEGRAM_SESSION_DIR=./sessions
TELEGRAM_SESSION_NAME=guilit_ingest
```

Only `ingest:auth`, `ingest:listen`, and `ingest:backfill` need these. The
synthetic corpus path (`make seed-corpus`) needs none of them — and that is the
path used for local development and demos, because the real Telegram sample in
this repo is only 89 messages, well under the `MIN_SAMPLE` threshold that makes
price statistics meaningful (`lib/price-stats-config.ts`).

Remember to keep `TELEGRAM_API_ID` commented out rather than blank when unused
(§3).

### 4.5 Gemini — optional, mock fallback is a first-class path

**Source: <https://aistudio.google.com/apikey>** → "Create API key" → select or
create a Google Cloud project → copy the `AIza...` string. The free tier covers
a demo comfortably.

```bash
GEMINI_API_KEY=                                  # blank = mock mode
GEMINI_VISION_MODEL=gemini-3.6-flash
GEMINI_PARSE_MODEL=gemini-2.0-flash-lite
GEMINI_MODEL=gemini-2.0-flash-lite               # ingest extraction
GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta
VISION_TIMEOUT_MS=5000
SEARCH_PARSE_TIMEOUT_MS=900
```

Blank, `mock`, or `none` trips `isMockMode()` (`lib/vision.ts:53`) and every
consumer degrades deliberately:

- **Vision autofill** returns fixed placeholder fields, no network call.
- **Search parsing** falls back to `lib/search-rules.ts`, which resolves prices,
  areas, conditions and categories deterministically. This is not a crippled
  mode — the rules answer **29/29** of the `make parse-eval` cases on their own
  (§6.2), which is why mock and production behave identically for the queries a
  demo actually types.
- **Ingest extraction** uses its mock batch path.

The two timeouts are budgets, not tuning knobs. `SEARCH_PARSE_TIMEOUT_MS=900` is
sized against a 1.5s end-to-end target over Ethiopian mobile data, leaving
~300ms of round trip each way. Raising them to paper over a slow model defeats
the fallback that is supposed to fire.

### 4.6 Storage — local by default, no credentials

```bash
STORAGE_BACKEND=local            # local | r2 | s3 | mock
LOCAL_STORAGE_DIR=./data/media
MAX_UPLOAD_BYTES=600000
```

`STORAGE_BACKEND=local` writes to disk and needs nothing external. Only set `r2`
if you actually want objects in Cloudflare.

**Source (R2 only): Cloudflare dashboard**

| Var | Where |
| --- | --- |
| `R2_ACCOUNT_ID` | R2 Overview page, or the 32-hex id in the dashboard URL |
| `R2_ACCESS_KEY_ID` | R2 → Manage API Tokens → Create (Object Read & Write) |
| `R2_SECRET_ACCESS_KEY` | Shown **once** at creation, not retrievable later |
| `R2_BUCKET_NAME` | R2 → Create bucket |
| `R2_ENDPOINT_URL` | Leave blank — derived as `https://<account_id>.r2.cloudflarestorage.com` (`lib/storage.ts:60`) |
| `R2_PUBLIC_URL` | Bucket → Settings → Public access (custom domain, or the `r2.dev` URL) |

`MAX_UPLOAD_BYTES` is a server-side ceiling per photo. The browser already
resizes to ~400KB before uploading (`lib/image-resize.ts`); 600KB is headroom
above that. Max 8 photos per listing (`lib/storage.ts:28`).

### 4.7 Tuning and production

```bash
PRICE_STATS_TTL_SECONDS=900      # staleness before a read rebuilds the buckets
ALBUM_DEBOUNCE_SECONDS=3.0       # window for grouping Telegram album messages
ALLOWLIST_REFRESH_SECONDS=60     # channels-table poll interval
LOG_LEVEL=INFO
LOG_FORMAT=pretty                # pretty | json

DOMAIN=                          # make prod-up only
ACME_EMAIL=                      # make prod-up only
```

`DOMAIN` and `ACME_EMAIL` come from your registrar/DNS. `DOMAIN` must already
have an A record pointing at the VPS or Caddy's ACME challenge fails.
`ACME_EMAIL` is where Let's Encrypt sends expiry warnings.

Price statistics rebuild on server start and every `PRICE_STATS_TTL_SECONDS` via
the scheduler in `instrumentation.ts`, and an admin can force a rebuild through
`POST /api/admin/price-stats/refresh`.

---

## 5. Seeding data

If `make dev` gives you an empty `/browse`, the database has no corpus.

```bash
npm run db:push                      # schema → 19 tables
npm run ingest:seed                  # channels from fixtures/channels.json
make seed-corpus COUNT=400           # seed-corpus → extract → dedup-run
```

Then restart the dev server so `instrumentation.ts` rebuilds `price_stats` (or
wait out `PRICE_STATS_TTL_SECONDS`).

A healthy database looks like this:

```
 listings | channels | raw | pstats | users
      500 |        8 | 493 |    175 |     1
```

`price_stats` needs enough comparables per bucket to be meaningful:

```bash
make stats
```
```
 buckets | usable | categories_with_range |          computed_at          |    age
     175 |     50 |                    10 | 2026-08-20 07:10:57.301106+00 | 00:03:05
```

`usable` counts buckets with `sample_size >= 8`. If that number is near zero,
raise `COUNT` and re-run `make seed-corpus`.

---

## 6. Testing

Six layers, cheapest first. Layers 1–4 need no credentials at all.

### 6.1 Automated suites

```bash
make test          # pytest + tsc --noEmit
npm run test:ingest
npm run typecheck
npm run lint
```

Expected, as of this writing:

| Command | Result |
| --- | --- |
| `npm run test:ingest` | **47 passed** in 2.23s |
| `npm run typecheck` | clean |
| `npm run lint` | clean (was 8 errors / 4 warnings — see §7) |

The pytest suite covers phone normalisation, PII stripping (including an
assertion that zero unmasked Ethiopian phone numbers reach the outbound Gemini
payload), content hashing, album grouping, resumable backfill, and the storage
clients. It uses mocks throughout — no network, no Telegram credentials.

### 6.2 Query parser evaluation

Needs the app running.

```bash
make parse-eval                        # or: BASE_URL=... make parse-eval
```

29 cases across English, Amharic, transliteration, price expressions (`20k`,
`ከ10000 በታች`, `ከ5ሺ በላይ`, `ከ2000 እስከ 8000`), areas, conditions, cache behaviour,
and three degradation cases (empty query, keyboard mash, 200-char garbage) that
must return 200 rather than error.

```
  passed 29, failed 0
```

It also dumps the `search_parses` cache table, which is the real assertion —
one row per distinct query, `hit_count 2`, proving the second identical search
was served from cache:

```
 normalized_query          | source | hit_count | latency_ms
 bag less than 3000 birr   | mock   |         2 |         48
 ስልክ ከ10000 በታች ቦሌ         | mock   |         2 |          6
```

`source: mock` here means the deterministic rules answered without calling
Gemini. That is the expected result with `GEMINI_API_KEY` blank.

### 6.3 Data-layer checks

```bash
make check-extensions       # vector, pg_trgm, unaccent present
make stats                  # price_stats freshness and coverage
./.venv/bin/python -m ingest.cli status
./.venv/bin/python -m ingest.cli dedup-report
./.venv/bin/python -m ingest.cli search-demo
./.venv/bin/python -m ingest.cli regex-stats
./.venv/bin/python -m ingest.cli confidence-histogram
./.venv/bin/python -m ingest.cli verify-pii
./.venv/bin/python -m ingest.cli search-benchmark
```

`dedup-report` proves the three-signal clustering collapsed cross-posts:

```
Total Extractions Evaluated:   493
Canonical Listings Created:    488
Cross-Channel Clusters Found:  2
Max Channels in Single Cluster:4
Auto-Merges Completed:         5
Borderline Reviews Flagged:    45

  [1] ባለ 3 ሰው L-Shape የሳሎን ሶፋ ... | Seen in 4 channels | Lowest Price: 23,500 ETB
  [2] Samsung 55 inch 4K Crystal UHD ... | Seen in 3 channels | Lowest Price: 36,500 ETB
```

`search-demo` is the bilingual-equivalence proof — the same synonym expansion
and the same 16 results for the Latin, Amharic, and misspelled-transliteration
forms of one word:

```
Query: 'sofa'   → 16 results, 26.10ms
Query: 'ሶፋ'     → 16 results, 25.34ms
Query: 'soffa'  → 16 results, 13.21ms
  Expanded: ['couch', 'l-shape', 'sofa', 'soffa', 'ሶፋ', 'ኤል ቅርጽ', 'የሳሎን እቃ']
✅ DEMO TEST PASSED
```

### 6.4 HTTP smoke test — no auth needed

Grab a real listing id first:

```bash
docker compose exec -T postgres psql -U guilit -d guilit -At \
  -c "SELECT id FROM listings WHERE status='live' AND price_etb IS NOT NULL LIMIT 1;"
```

Note the enum values, which are easy to guess wrong: `listings.status` is
`live | queued | removed` (not `published`), the price column is `price_etb`
(not `price`), and `listings.tier` is `indexed | claimed | native`.

Unauthenticated surface:

```bash
for u in /browse /login /post /admin; do
  printf "%-10s %s\n" "$u" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000$u)"
done
```
```
/browse    200
/login     200
/post      200
/admin     403     ← correct: requireAdmin() with no session
```

`/` returns **307** — it redirects to `/browse`.

Browse filter matrix. Recognised params are `q`, `category`, `area`,
`condition` (repeatable), `tier` (repeatable), `minPrice`, `maxPrice`, `sort`,
`page`, `cursor` (`lib/listings.ts:552`). `sort` accepts
`newest | price_asc | price_desc | channels`.

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/browse?q=sofa'
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/browse?category=phones&maxPrice=30000'
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/browse?area=Bole&sort=price_asc'
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/browse?condition=brand_new&condition=lightly_used'
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/browse?minPrice=1000&maxPrice=5000&sort=channels'
```

All 200. Valid `category` slugs: `appliances books computers electronics fashion
furniture kids other phones tools tv-audio vehicles`. Valid `area` values
include `Bole Piassa Kazanchis CMC Sarbet Jemo Kality Saris Hayahulet Kolfe
"Gurd Shola" "Shiro Meda"`.

Natural-language parser:

```bash
curl -s -X POST http://localhost:3000/api/search/parse \
  -H 'content-type: application/json' \
  -d '{"q":"iphone 13 under 30k bole"}'
```
```json
{"query":{"category":"phones","area":"Bole","maxPrice":30000,"q":"iphone 13"},
 "original":"iphone 13 under 30k bole",
 "confidence":{"category":0.9,"area":0.9,"maxPrice":0.85},
 "suggestions":[],"source":"mock"}
```

Price fairness signal:

```bash
curl -s "http://localhost:3000/api/listings/$ID/price-context"
```
```json
{"available":true,"context":{
  "priceEtb":38000,"basis":"term","bucketLabel":"tv","categorySlug":"tv-audio",
  "sampleSize":18,"medianEtb":31150,"p25Etb":22825,"p75Etb":46250,
  "lowFenceEtb":7977,"highFenceEtb":131541,
  "verdict":"fair","outlier":null,"deltaFromMedianPct":22}}
```

If this returns `{"available":false}`, the listing's bucket has fewer than
`MIN_SAMPLE` comparables — grow the corpus (§5), not a bug.

### 6.5 Manual browser walkthrough — no auth needed

1. **`/browse`** — grid renders, filter sidebar populated from the `categories`
   table, sort control works, pagination advances.
2. Type a mixed query in the search box — `ስልክ ከ10000 በታች ቦሌ`, or
   `laptop 20k`. The parsed chips (category, area, price ceiling) should appear
   and narrow the grid.
3. Search `sofa`, then `ሶፋ`, then `soffa` — identical result sets (§6.3).
4. **`/listing/<id>`** — detail page, photo gallery, the "seen in N channels"
   badge on a cross-posted listing, and the price fairness band.
5. Search deliberate garbage (`asdkjh qwe zxc`) — empty state, not an error.

### 6.6 Auth-gated flows — credentials required

Prerequisites: a real bot token, a tunnel host, `/setdomain` set, and
`NEXT_PUBLIC_APP_URL` pointing at the tunnel (§4.2). Restart the dev server
after changing env files.

**Login.** Visit `/login` → the Telegram widget renders → one tap → redirected
to `/` with a `gl_session` cookie set. If the page says
"TELEGRAM_BOT_USERNAME is not configured", the env var did not reach the server
process. If you land on `/login?error=invalid_auth`, the bot token is wrong or
the auth payload is older than 24h.

**Admin.** Promote yourself (§4.3), then walk `/admin`, `/admin/queue`,
`/admin/channels`, `/admin/reports`, `/admin/removals`. In the queue, approve
and reject an item and confirm the `moderation_logs` row is written.

**Claiming — no SMS provider needed.** `lib/otp.ts` is a deliberate hackathon
mock: `sendOtp` logs instead of sending, and the code `000000` is always
accepted.

1. Open a listing whose source message carried a phone number.
2. Request the claim code. The real code is printed to the dev-server stdout:
   `[claim-otp] phone=+251911223344 code=482913`
3. Enter that code, or just `000000`.
4. The listing flips to `tier = claimed`, `sellerId` is set, and your
   `users.phone` / `users.phoneVerified` are written.

Rate limits are real: 3 OTP requests per phone per hour, and 5 wrong attempts
before the code is burned.

**Posting.** `/post` → upload photos → autofill returns placeholder fields in
mock mode (set `GEMINI_API_KEY` to see real vision output) → adjust → submit.
Max 8 photos, 600KB each after the client-side resize.

### 6.7 Snapshot before you demo

```bash
make snapshot     # → snapshots/snapshot_<ts>.sql.gz + snapshots/latest.sql.gz
make restore      # ← snapshots/latest.sql.gz
```

Run `make stats` **before** `make snapshot` so the restored database ships with
warm price statistics rather than rebuilding on first load.

---

## 7. Fixed issues, and what changed

Five problems were found while validating this guide. All five are fixed; this
section records them so the fixes are reviewable.

**`make seed` failed on an undefined function.** The `seed-channels` subcommand
dispatched to `run_seed_channels_command`, which existed nowhere in
`ingest/cli.py`, so `make seed` and `npm run ingest:seed` both died with
`NameError`. The handler is now implemented: it reads `fixtures/channels.json`
(tolerating both a bare list and a `{"channels": [...]}` wrapper), upserts on
`telegram_id`, and ignores `_`-prefixed annotation keys. Re-running syncs titles
and active flags rather than duplicating rows — verified 8 channels in, 8 rows
after a second run.

`Makefile:58` also invoked bare `python` where its sibling targets use
`./.venv/bin/python`. That turned out **not** to be a defect: `ingest/cli.py:11-26`
carries a shim that re-execs into `.venv/bin/python` when `telethon`/`psycopg`
are missing. The line was changed anyway, for consistency with the neighbouring
targets and so the venv is used without relying on an `execve`.

**`ingest.cli status` was dead.** `main()` dispatched to `run_status_command`,
also undefined. Implemented against the already-present but unused
`Database.get_ingest_stats()`. It is read-only and needs no Telegram
credentials, so it reports usefully on a synthetic corpus:

```
 ID  CHANNEL                    ON   MESSAGES  LAST MSG  LATEST POST
  1  @addis_used_market         ✓          81      4823  2026-08-18 17:47
  2  @ethio_brand_phones        ✓          57      3120  2026-08-18 02:47
  ...
8 channels (8 active) · 493 raw messages captured
```

**`docker-compose.yml` starved the web container.** The `web` service forwarded
only `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `STORAGE_BACKEND`, `R2_*`, and
`LOCAL_STORAGE_DIR` — never `SESSION_SECRET`, `TELEGRAM_BOT_*`, `ADMIN_*`, or any
`GEMINI_*`. `make up` therefore produced a container that threw
`SESSION_SECRET environment variable is not set` on any session read and rendered
"TELEGRAM_BOT_USERNAME is not configured" on `/login`.

All of them are now forwarded, and `SESSION_SECRET` uses compose's required-variable
form so an unset value fails the `up` with a readable message instead of booting a
broken container:

```
error while interpolating services.web.environment.SESSION_SECRET: required
variable SESSION_SECRET is missing a value: set SESSION_SECRET in .env —
generate one with openssl rand -hex 32
```

The Gemini extraction config (`GEMINI_API_KEY`, `GEMINI_MODEL`,
`GEMINI_API_BASE_URL`, `EXTRACTION_BATCH_SIZE`) was likewise missing from both
ingest services and is now passed through.

**Admin auto-promotion could not fire from a Telegram login.** `ADMIN_PHONE` was
matched against `users.phone`, which only the OTP claim flow writes, so a
freshly logged-in user always had `phone = NULL`. `getSessionUser()`
(`lib/session.ts`) now also matches `ADMIN_TELEGRAM_USERNAME` against
`users.username` — case-insensitively, with an optional leading `@` — which is
the field the Login Widget actually sends. The `ADMIN_PHONE` path is unchanged,
so existing deployments behave the same, and the function now returns early for
users who are already admins instead of re-checking on every request.

**Lint is clean.** Was 8 errors and 4 warnings, now zero:

- Five `react/no-unescaped-entities` errors — replaced with `&rsquo;` / `&ldquo;`
  / `&rdquo;` in `app/admin/removals/page.tsx`, `app/post/page.tsx`,
  `components/post/listing-form.tsx`, `components/post/photo-step.tsx`,
  `components/post/post-flow.tsx`.
- `components/post/listing-form.tsx` read a localStorage flag through a mount
  effect. Since that flag is read-only external state, it now uses
  `useSyncExternalStore` with a server snapshot, and `lib/post-draft.ts` gained
  a subscription so `dismissReasoning()` and `clearDraft()` notify subscribers.
  The `reasoningHidden` state and its setter are gone.
- `components/post/post-flow.tsx` restores a draft into six pieces of
  **editable** state, which genuinely requires a post-mount write: localStorage
  does not exist during SSR, so reading it in render would desync the markup,
  and `useSyncExternalStore` does not apply to state the component mutates. The
  writes are batched into a single re-render, so the rule is suppressed at that
  one spot with a comment explaining why, rather than reshaping working code to
  satisfy a heuristic.
- Three unused symbols removed: the `total` prop on `QueueWorkspace` (the
  caller passed `items.length`, which the component never read), `isUuid` in
  `app/api/admin/removals/[id]/approve/route.ts`, and `reports` in
  `app/api/listings/[id]/remove/route.ts`.
- `queue-workspace.tsx` had a keydown effect with a missing `handleAction`
  dependency. `handleAction` is now a `useCallback` and is listed honestly;
  `edits` dropped out of the effect's deps because the callback closes over it.
  Note the declaration had to move **above** the effect — `const` is not hoisted
  the way the `function` declaration it replaced was.

Verified after all of the above: `npm run lint` clean, `npm run typecheck`
clean, `npm run test:ingest` 47 passed, `make parse-eval` 29/29, `make seed`
succeeds, and `/browse`, `/login`, `/post` still return 200 with `/admin` at 403.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `DATABASE_URL environment variable is not set` | `.env.local` missing, or process started outside the project root | Check `.env.local` exists; Next reads it only at boot |
| `SESSION_SECRET environment variable is not set` | Unset | `openssl rand -hex 32` into `.env.local`. `make up` now refuses to start without it rather than failing at runtime |
| `ValidationError: TELEGRAM_API_ID Input should be a valid integer` | `TELEGRAM_API_ID=` left empty | Comment the line out (§3) |
| 12 × `variable is not set. Defaulting to a blank string` from compose | No `.env` file — compose does not read `.env.local` | Create `.env` (§3) |
| `/login` shows "TELEGRAM_BOT_USERNAME is not configured" | Var absent from the server process | Set it, restart dev server |
| Login always redirects to `/login?error=invalid_auth` | Wrong bot token, or domain not registered via `/setdomain` | §4.2 |
| `/admin` returns 403 while logged in | `users.is_admin` is false | Promote by hand (§4.3) |
| `/browse` renders but is empty | No corpus | §5 |
| `price-context` returns `{"available":false}` | Bucket below `MIN_SAMPLE` | Grow the corpus with a larger `COUNT` |
| Search returns nothing for Amharic input | `search_synonyms` not seeded | `./.venv/bin/python -m ingest.cli seed-synonyms` |
| `ModuleNotFoundError: No module named 'telethon'` | `.venv` missing or incomplete. Bare `python` is *not* the cause — `ingest/cli.py:11-26` re-execs into the venv automatically | `./.venv/bin/pip install -r requirements.txt` |
| Postgres connection refused | Container down | `docker compose up -d postgres`; check `docker compose ps` for `(healthy)` |
