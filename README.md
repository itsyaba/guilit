# Gulit — Project Brief

**Vintage Challenge Round 1: Used Goods Web Marketplace**
Submission deadline: **26 August 2026** · Written: 16 August 2026 · **11 days remaining**

---

## 1. The one-paragraph version

Ethiopia's second-hand market already exists — it lives in Telegram channels. Thousands of people post sofas, phones, and cars every day into channels with no search, no filters, no price history, and no way to tell a real seller from a scammer. Every existing marketplace asks those sellers to leave Telegram and come to a website instead. Almost none of them do.

**We don't ask them to move. We index where they already are.**

We aggregate 30+ Telegram channels into one searchable, deduplicated, filterable marketplace. Sellers can also post directly on our site. Buyers get real search, honest price signals, and alerts when the thing they want appears anywhere in the network.

---

## 2. Why this wins (and the market reality)

### We are not entering an empty market

Two established players already exist and the judges use them:

- **Jiji Ethiopia** — 750,000+ live listings, recently launched a paid premium tier
- **Engocha** — classifieds plus business directory, cars, electronics, property

**Do not pretend we invented online classifieds in Ethiopia.** A panel of senior Ethiopian developers will spot that in thirty seconds and we lose credibility for everything that follows.

### Our actual position

> Jiji and Engocha ask sellers to come to them. The real second-hand supply lives in Telegram channels and never reaches either platform. We index where the goods already are.

This is honest, defensible, and it's *literally the problem statement in the challenge brief*.

### Why an incumbent won't just copy us

Jiji's revenue depends on sellers coming to them and paying for placement. Indexing free Telegram supply would cannibalise their own listings business. Incumbents don't build the thing that undercuts their revenue model. That's the answer when the panel asks — and they will ask.

---

## 3. How it works

There are three flows. Understand these and you understand the whole product.

### 3.1 Supply — how listings get in

**Path A: Scraped from Telegram**

1. A Python service using **Telethon** listens to 30+ allowlisted channels over MTProto.
   *(Admins can add more channels from a dashboard.)*
2. Every message is written **raw** into Postgres before any processing.
3. A **regex pass** extracts prices and phone numbers. This doubles as a filter — no price token means it's almost never a listing, which cuts LLM volume by more than half.
4. What survives goes to **Gemini in batches** for structured fields: title, category, condition, location, plus a confidence score.
5. **Dedup** collapses the same item cross-posted to multiple channels into one canonical listing.
6. **Routing**: high confidence auto-publishes. Low confidence or scam-heuristic hits go to a review queue.

**Path B: Posted directly by a user**

1. User signs in with Telegram, uploads photos.
2. A vision model fills in title, category, condition estimate, and a suggested price from our comparables data.
3. User edits and confirms. Established accounts publish instantly; brand new accounts publish with contact details hidden pending review.

#### Why we store raw messages first — this matters

Our extraction logic **will** be wrong on day 3 and right on day 9. We'll tune the price regex, swap the prompt, add categories, discover Amharic phrasing we didn't anticipate. Each change means re-running over everything we've collected.

With raw storage that's a local batch job that takes a minute. Without it, every change means re-scraping 30 channels — and we may not be able to. `FloodWaitError` is routine, and a scraping account that gets rate-limited on 24 August is a project-ending event.

It also splits our failure domains: the listener does one dumb fast thing (insert and move on). If the LLM is down or extraction throws, capture keeps running and nothing is lost.

And the product needs it anyway — the moderator dashboard shows the original message beside the extracted fields.

#### Why dedup is our standout feature

The same sofa gets cross-posted to five channels. Every team that skips this ships a search page full of the same item repeated five times. We use three signals:

| Signal | Method | Strength |
|---|---|---|
| Image | Perceptual hash (pHash) on first photo | Catches reposts and near-duplicates |
| Phone | Exact match on extracted number | **Strongest** — same number + similar price + same category = same item |
| Text | Embedding similarity via pgvector | Catches rewrites and translations |

Displayed to the buyer as: **"Seen in 4 channels · lowest 8,500 ETB"**

That's a five-second demo beat that instantly reads as real engineering.

### 3.2 The listing tier ladder

Every live listing sits in one of three tiers. This is simultaneously our growth mechanic **and** our legal posture.

| Tier | State | Capabilities |
|---|---|---|
| **Indexed** | Scraped, unclaimed | Searchable · channel attribution · links to original post · contact routes to seller's own Telegram · one-click "this is mine, remove it" |
| **Claimed** | Seller verified the phone number already in the listing via OTP | Can edit · receives ratings · marked as claimed · in-app messaging as a second route under Telegram · can be reserved |
| **Native** | Posted directly on our site | Everything above + in-app messaging as the *primary* route + verified badge |

**Why this framing matters legally.** Republishing someone's listing wholesale on our own domain invites awkward questions. Aggregating, attributing, and routing contact back to the source does not. Same pipeline, different posture — and the second one is also a better product story.

Claiming is elegant: the seller receives an OTP on the phone number *already in the listing*. That proves ownership with no paperwork, and quietly converts a scraped row into a registered user.

### 3.3 Demand — how buyers find things

**Browse is the default surface.** A Jiji-style grid: categories, price range, condition, location sorting, and bilingual search across Amharic script, English, and Latin transliteration. Typing `sofa`, `ሶፋ`, and `soffa` must return identical results.

**Chat is a search bar that understands sentences — not a separate product.**

This is an important distinction. A chat-first marketplace has three problems in this market: typing an Amharic sentence on a phone is slower than tapping a filter, every query costs inference money, and round-trip latency on Ethiopian mobile data makes conversation feel broken.

So: `"bag under 3000 birr"` → **one** LLM call extracts `{category: bags, max_price: 3000}` → user lands on the **browse page** with filter chips already applied and editable.

They see what it understood. They can tap to adjust. One call per query, not a conversation.

**Saved search alerts — the feature only we can build.**

A buyer says *"notify me when a Samsung A54 under 15,000 appears."* Our ingestion pipeline matches every incoming scraped listing against saved queries and pings them on Telegram within minutes.

Jiji cannot do this — they only see their own listings. The channels can't — they have no search. This is what our architecture makes possible and nobody else's does. **If we build one AI feature beyond query parsing, build this one.**

---

## 4. Feature list

### Must have (we fail without these)

- [ ] Telegram ingestion from 30+ channels, raw storage, backfill + live
- [ ] Extraction pipeline (regex + Gemini batch)
- [ ] Deduplication across channels
- [ ] Browse page: categories, filters, sorting, pagination
- [ ] Bilingual search (Amharic / English / transliteration)
- [ ] Listing detail page with attribution and contact
- [ ] Native posting flow with auth
- [ ] Admin: add channel, moderation queue
- [ ] Fully responsive — the rubric names this explicitly
- [ ] README + architecture diagram
- [ ] 3–5 minute video

### Should have (these win points)

- [ ] AI photo autofill for native posts
- [ ] Chat query parser
- [ ] Price fairness signal (median + IQR by category and condition)
- [ ] Saved search + Telegram alerts
- [ ] Seller ratings, report/flag
- [ ] "Seen in N channels" dedup display
- [x] In-app messaging for listings with a registered seller, with Telegram push
- [x] Pay from the thread — seller asks for the agreed figure, buyer pays it there

### Nice to have (only if genuinely ahead)

- [ ] Fayda ID upload → manual review queue → verified badge
- [x] Chapa "reserve item" hold — deposit through Chapa holds an item for 24h
- [ ] "Wanted" posts (buyers list what they're looking for)
- [ ] Outbound broadcast of native listings to our own channel

---

## 5. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Web | **Next.js (App Router)** | SSR listing pages for SEO; React ecosystem for AI SDK and shadcn |
| UI | **shadcn/ui + Tailwind** | Fastest route to something that looks deliberate, not templated |
| Database | **Postgres 16** | `pg_trgm` + `tsvector` + `pgvector` all in one box |
| ORM | **Drizzle** | Type-safe, but drops to raw SQL cleanly for search |
| Ingestion | **Python + Telethon** | Forced choice — see below |
| AI | **Gemini free tier** | See §6 |
| Images | **Cloudflare R2 + sharp** | Free egress, S3-compatible, portable |
| Deploy | **Docker Compose** on a VPS | Three containers, runs anywhere |

### The one forced decision

**Ingestion must be Python.** Telethon is the only battle-tested MTProto client, and the Telegram Bot API can only read channels where the bot is an admin — which we won't be. So we are polyglot no matter what. Accept it on day 1 and design the seam deliberately rather than discovering it on day 4.

### The seam between the two services

**Postgres is the contract.**

- Drizzle owns the schema and **all** migrations
- Python reads and writes with plain `psycopg` against known tables
- **Do not** try to share an ORM or generate types across the boundary

One source of truth for schema, two consumers.

### Deliberate omissions

**No Redis.** Postgres is the job queue — `SELECT ... FOR UPDATE SKIP LOCKED` against a `jobs` table. At our scale we lose nothing, and we drop a whole service from the deployment. That matters when five people need one reproducible environment in eleven days.

**No Elasticsearch or Meilisearch.** Postgres full-text with the `simple` config plus `pg_trgm` handles our languages and volume fine. Meilisearch is nicer for typo tolerance but adds a container, a sync pipeline, and a consistency bug we'd find on day 9.

> **Put this in the README:** "We would move to a dedicated search index past ~100k listings." Showing we know where the ceiling is scores better than building it.

### Repo layout

```
/web              Next.js app
/ingest           Python: telethon listener + workers
/db               Drizzle schema + migrations  ← single source of truth
docker-compose.yml
README.md
```

Single repo, two runtimes, one canonical schema directory. That satisfies "clean, modular code with a clear project directory" without configuring a monorepo tool.

### Small things that punch above their weight

- **Subset Noto Sans Ethiopic** rather than loading the whole face — it's heavy and bandwidth is a real constraint for our users
- **Resize images client-side** before upload; serve WebP at responsive sizes
- Both show up in Lighthouse, which the panel will run

---

## 6. The AI layer

We're on the **Gemini free tier**, which is fine — but the binding constraint is the **daily request cap**, not quality. It will bite during backfill specifically.

> Rate limits move around and blog sources conflict. Check Google's official rate limits page. Roughly: Flash models sit around 10–15 RPM with daily caps in the hundreds-to-low-thousands; Pro is effectively locked out. **Limits apply per Google Cloud project, not per API key** — five people generating five keys on one project gets us nothing.

### The fix that makes this a non-issue: batch aggressively

**Put 20 messages in one request.** One prompt, twenty numbered Telegram posts, one JSON array back.

A 5,000-message backfill becomes **250 requests instead of 5,000** — comfortably inside a single day's quota, with room to reprocess when the prompt changes.

This is the whole ballgame. Per-message calls hit the daily wall on day one and cost us 48 hours waiting for a reset. Batched, we never notice the limit exists.

Supporting moves:
- **Hash the message text and cache results.** Reprocessing then only pays for what actually changed.
- **Lean on the regex pre-filter harder** than we would with a paid model.

### PII stripping — do not skip this

Google's free tier terms permit using prompts for training. The paid tier does not. We are about to send Ethiopian phone numbers to it.

This collides directly with the compliance story in §8, and a sharp judge could ask.

**The fix, which actually makes our story stronger:**

Our regex pass already extracts phone numbers. Replace them with `[PHONE_1]` in the text we send, and reattach from our own database afterward. The model never sees a real number. Do the same for Telegram usernames in message bodies.

> **README line:** "PII never leaves our infrastructure." That's better than "we pay for the enterprise tier."

### Model assignment

| Job | Model | Notes |
|---|---|---|
| Batch extraction | Flash-Lite | Highest RPM; this is classification, not reasoning |
| Chat query parsing | Flash-Lite | One call per search, tiny output |
| Photo autofill | Flash | Vision needed; low volume, native posts only |
| Embeddings | `text-embedding-004` | **Separate quota** — dedup and semantic search don't compete with extraction |

### Guardrails — build these on day 1, not day 9

- **429 handler** with exponential backoff. On daily-cap exhaustion the job **stays queued** rather than failing — our Postgres job table gives us this for free, just don't mark the row done.
- Set `responseMimeType: "application/json"` with a response schema so we get parseable output instead of markdown fences.
- **Manual-entry fallback** in the native posting flow. If the vision call fails mid-demo we want a form, not a spinner.

> If anyone on the team has a card they're willing to attach, Tier 1 is pay-as-you-go with no commitment. At our volume — a few hundred batched requests — actual spend is well under a dollar for the whole challenge, and it removes both the daily cap and the training-data concern. Optional. The batching approach genuinely works without it.

---

## 7. Trust & safety

This is 20% of the grade in disguise, and most teams will build a report button and call it done.

### Routing — don't gate everything

Gating every listing is a bottleneck we can't staff and it looks naive. Route by risk:

| Condition | Action |
|---|---|
| Scraped, confidence > 0.8 | Auto-publish as indexed |
| Scraped, confidence < 0.8 | Review queue |
| Price 70%+ below category median | Queue regardless of confidence |
| Phone already linked to a flagged listing | Queue |
| Native post, established account | Auto-publish |
| Native post, new account | Publish, contact details hidden pending review |
| 3+ user reports | Auto-hide, immediate queue |

### The moderator dashboard

Build this as a **real screen**, not an afterthought:

- Original Telegram message on the left, extracted fields on the right
- One-click approve / edit / reject
- Keyboard shortcuts

Showing a moderator clear a queue in the video is what makes this read as a company rather than coursework. **Seed the queue before recording.**

### Non-technical safety work

- Meetup guidance surfaced in the contact flow — public locations, daylight, bring someone
- A published list of scam patterns Ethiopians actually encounter: advance payment before viewing, "my brother will deliver it," pressure to move off-platform immediately
- Price outliers flagged **visually** — a suspiciously cheap iPhone should look suspicious to the buyer, not just to our classifier

### Be honest about verification limits

A badge saying "phone verified" is trustworthy. A badge saying "verified seller" when we only checked a phone number is a lie the judges will catch. If Fayda ID review is a manual stub, **say so in the README.** Judges respect a clearly marked boundary far more than a black box.

---

## 8. Legal & compliance

**This section is worth thirty seconds of the pitch and no other team will have it.**

Ethiopia's **Personal Data Protection Proclamation No. 1321/2024** took effect July 2024, with the Ethiopian Communications Authority as regulator. It grants rights to access, rectify, and erase personal data, and requires breach notification within 72 hours.

Two parts hit us directly:

**Data residency.** The proclamation requires personal data collected in Ethiopia to be stored domestically, with cross-border transfer permitted only under specific conditions. No managed provider has an Ethiopian region, so for the sprint we deploy abroad — unavoidable and fine. **What matters is that we don't couple to a provider.**

Concretely: run Postgres in Docker ourselves. No provider-specific auth, no edge functions, no proprietary RLS. Then the entire system is `docker compose up` on an Ethiopian VPS the day it needs to be. Write this up as a data-residency section in the README.

**Right to erasure.** This is exactly why every indexed listing carries a one-click "this is mine, remove it."

We are scraping phone numbers. Under this law that is personal data processing. Showing the panel we knew that — and designed for it — separates us from every other submission instantly.

### Channel relationships

Maintain an explicit **allowlist**, documented in the README. Then message 2–3 channel admins and ask permission. If even one says yes, "we partnered with X channel" is a line in the pitch nobody else will have.

---

## 9. Team split

**Day 1 is contract day.** One person locks the Drizzle schema and writes every API route as a typed stub returning fixtures. **Nobody merges anything else until that lands.** Everyone then builds against real types with fake data.

The failure mode with five people on a short greenfield build isn't capacity — it's everyone blocked on schema and auth for two days.

| Role | Owns |
|---|---|
| **Platform** | Schema, auth, image pipeline, Docker, CI, deploy. *Most senior person — unblocks everyone.* |
| **Ingestion** | Telethon service, backfill, live handler, album grouping, raw storage, dedup |
| **Intelligence** | Extraction pipeline, embeddings, bilingual + semantic search, price stats |
| **Web** | Listing pages, browse, filters, claim flow, seller profiles, messaging |
| **Trust & polish** | Moderation dashboard, reports, ratings, mobile QA, seed data, Lighthouse |

Ingestion and Intelligence share pgvector — **pair these two closely.**

One protected `main`, short-lived branches, mandatory review. Skip this and we spend more time on conflicts than features.

> ⚠️ **Team size:** the challenge states 2–4 members. Confirm our roster with `support@vintechplc.com` rather than discovering a problem at judging.

---

## 10. Timeline

| Date | Focus |
|---|---|
| **Aug 16** | Telethon auth working · allowlist defined · raw capture running · **API contracts locked** |
| **Aug 17–18** | Backfill runs in background. Extraction, schema, auth, listing pages in parallel |
| **Aug 18** | Dedup + search over real scraped data. **Attend the architecture review** — free read on what the panel weights |
| **Aug 19–20** | Integration. Claim flow, moderation dashboard. **Cut whatever isn't working** |
| **Aug 21–22** | Price signals, native posting, chat parser, saved alerts, polish |
| **Aug 23** | Mobile QA · Lighthouse ≥90 · error states · **DB snapshot for demo** |
| **Aug 24** | README + architecture diagram + deployed demo link |
| **Aug 25** | **Scripted** video — one person editing while others fix what the script exposes |
| **Aug 26** | Buffer. We will use it. |

### The tax nobody budgets for

Five people means integration debt, and it comes due around day 5. **Aug 19–20 is not padding.**

The temptation is to keep building through the 24th. Don't. A polished four-feature demo beats a broken eight-feature one, and the README plus video carry more weight than the last two features we cram in.

---

## 11. How we actually win the pitch

Scoring: Innovation 30% · Technical 30% · UX 20% · Scalability 20%

### The video is 20% of the grade in disguise

It's how the panel forms their opinion of everything else. Structure it as a **story**, not a feature tour:

1. Here's how someone sells a sofa today — screenshot of a chaotic Telegram channel
2. Here's that same sofa on our platform in 15 seconds
3. Here's a buyer finding it three channels later **without seeing it four times**

Lead with the **dedup moment** and the **saved-search alert**. Those two make a senior developer sit up.

### Demo safety

**Never demo live scraping.** Pre-seeded database, snapshotted, with a rollback script.

If we want a live moment, script it: have someone post to a test channel we control and show it appearing. Have the pre-recorded version ready if the network sulks.

**Seed 500+ realistic listings** — real Addis neighbourhoods, real item names, real prices. An empty database on demo day loses more points than a missing feature.

### Questions they will ask

| Question | Answer |
|---|---|
| "What stops Jiji from copying this?" | Their revenue depends on sellers paying for placement. Indexing free supply cannibalises their own listings business. |
| "Is scraping legal?" | We index and attribute, we don't republish. Allowlist, source links, contact routed to origin, one-click removal, and we've read Proclamation 1321/2024. |
| "How does this make money?" | Promoted listings + verified-seller tier + shop pages for resellers. Commission on P2P used goods is unenforceable early and we won't claim it. Long term: we have a used-goods price index for Addis that nobody else has. |
| "What breaks at scale?" | Postgres FTS past ~100k listings → dedicated index. Single scraper account → session pool. Both documented in the README. |

---

## 12. Explicitly NOT building

Writing these down prevents someone building them at 2am on the 24th.

- ❌ In-app chat as the *default* contact method — Telegram deep links and `tel:` stay primary for indexed and claimed listings, and that is a deliberate choice, not a gap. In-app messaging exists where Telegram cannot serve: a native listing has no channel post to open. See `lib/messaging.ts`.
- ❌ Escrow or full payment checkout — a **Chapa deposit hold** only. 5% of the price, floored at 50 ETB and capped at 1,000, holding the item for 24h. Nobody buys a used sofa sight unseen, and taking the full price for a handover we cannot enforce would be a promise we have no way to keep. The hold can be started from the listing or, at a figure the two of them agreed, from inside the conversation — a negotiation's closing number is rarely the listed one.
- ❌ Real Fayda verification — manual review stub, clearly labelled
- ❌ Mobile apps — responsive web only, per the brief
- ❌ Delivery/logistics
- ❌ Multi-city beyond Addis for the demo

---

## 13. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Scraper account rate-limited or banned | **Project-ending** | Burner number · `FloodWaitError` backoff · persist session to a volume · **raw data already in Postgres** |
| Gemini daily cap hit during backfill | 48h lost | Batch 20 per request · cache by text hash · aggressive regex pre-filter |
| Integration debt on day 5 | Timeline collapse | Day 1 contracts · two full reserved days |
| Empty demo database | Loses points | Seed 500+ listings by Aug 23 · snapshot |
| Team size rule (2–4 vs our 5) | Disqualification | **Email support@vintechplc.com now** |
| Amharic embedding quality poor | Semantic search weak | Test on real listing text before committing · `pg_trgm` fallback always available |

---

## 14. Naming

**Gulit** (ጉሊት) — the informal open-air market. It's precisely what we're indexing.

Check the connotation with a native speaker; some read it as low-end, which we can either lean into or avoid. Alternatives: **Kafya**, **Tilek**, or something deliberately plain in English.

---

## 15. First actions

1. Confirm team roster with the organisers
2. Lock the Drizzle schema and API contracts — **everything is blocked on this**
3. Get Telethon authenticated on a burner number and capturing raw
4. Define the channel allowlist; message 2–3 admins for permission
5. Stand up Docker Compose so everyone has one reproducible environment
