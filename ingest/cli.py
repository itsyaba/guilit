# Auto-detect and switch to .venv if running with system python without dependencies
import os
import sys
from pathlib import Path

# Ensure project root is in sys.path
_project_root = Path(__file__).resolve().parent.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

try:
    import telethon  # type: ignore # noqa: F401
    import psycopg  # type: ignore # noqa: F401
except ImportError:
    venv_python = _project_root / ".venv" / "bin" / "python"
    if venv_python.exists() and sys.executable != str(venv_python):
        env = dict(os.environ)
        env["PYTHONPATH"] = str(_project_root) + (f":{env['PYTHONPATH']}" if "PYTHONPATH" in env else "")
        args = [str(venv_python), "-m", "ingest.cli"] + sys.argv[1:]
        os.execve(str(venv_python), args, env)
    else:
        sys.stderr.write(
            "Error: Missing required dependencies (telethon, psycopg, etc.).\n"
            "Please run: source .venv/bin/activate OR pip install -r requirements.txt\n"
        )
        sys.exit(1)


import argparse
import asyncio
import json
import os
import signal
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


from ingest.backfill import BackfillService
from ingest.client import TelegramIngestClient
from ingest.config import settings
from ingest.db import Database
from ingest.listener import LiveListener
from ingest.logging_utils import get_logger, setup_logging

logger = get_logger("ingest.cli")



async def run_auth_command(phone: Optional[str] = None) -> None:
    """Authenticates a burner number interactively and persists the session."""
    setup_logging(level=settings.LOG_LEVEL, log_format=settings.LOG_FORMAT)
    print("==================================================")
    print("   Gulit Ingest — Telegram Interactive Auth       ")
    print("==================================================")
    print(f"Session directory: {settings.TELEGRAM_SESSION_DIR}")
    print(f"Session name:      {settings.TELEGRAM_SESSION_NAME}.session")
    print("--------------------------------------------------")

    client = TelegramIngestClient(settings)
    await client.interactive_auth(phone=phone)
    await client.disconnect()


async def run_listen_command() -> None:
    """Runs the live ingestion listener daemon."""
    setup_logging(level=settings.LOG_LEVEL, log_format=settings.LOG_FORMAT)
    listener = LiveListener(cfg=settings)

    stop_event = asyncio.Event()

    def _sig_handler(sig, frame):
        logger.info(f"Received signal {sig}. Initiating graceful shutdown...")
        stop_event.set()

    # Register OS signals for graceful shutdown
    signal.signal(signal.SIGINT, _sig_handler)
    signal.signal(signal.SIGTERM, _sig_handler)

    try:
        await listener.start()
        # Keep running until signal received
        while not stop_event.is_set():
            await asyncio.sleep(0.5)
    except Exception as e:
        logger.error(f"Fatal error in live listener: {e}", exc_info=True)
    finally:
        await listener.stop()


async def run_backfill_command(
    channel: Optional[str] = None,
    since: Optional[str] = None,
    limit: Optional[int] = None,
    batch_size: Optional[int] = None,
    force_full: bool = False,
) -> None:
    """Runs the historical backfill process."""
    setup_logging(level=settings.LOG_LEVEL, log_format=settings.LOG_FORMAT)
    service = BackfillService(cfg=settings)
    try:
        await service.run(
            channel_target=channel,
            since=since,
            limit=limit,
            batch_size=batch_size,
            force_full=force_full,
        )
    finally:
        await service.tg.disconnect()
        await service.db.close()


async def run_extract_command(
    limit: Optional[int] = None,
    batch_size: Optional[int] = None,
    prompt_version: Optional[str] = None,
) -> None:
    """Executes the two-pass extraction pipeline against unprocessed raw messages."""
    setup_logging(level=settings.LOG_LEVEL, log_format=settings.LOG_FORMAT)
    b_size = batch_size or settings.EXTRACTION_BATCH_SIZE
    p_version = prompt_version or settings.PROMPT_VERSION

    print("==================================================")
    print("   Gulit Ingest — Two-Pass Extraction Pipeline    ")
    print("==================================================")
    print(f"Batch size:     {b_size} messages / request")
    print(f"Prompt version: {p_version}")
    print(f"Gemini Model:   {settings.GEMINI_MODEL}")
    print(f"API Mode:       {'Mock (Offline)' if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY.lower() in ('mock', 'none', '') else 'Live Gemini API'}")
    print("--------------------------------------------------")

    db = Database(settings.DATABASE_URL)
    await db.connect()

    try:
        from ingest.extract.pipeline import ExtractionPipeline
        from ingest.extract.gemini_client import GeminiBatchExtractor

        pipeline = ExtractionPipeline(
            db=db,
            gemini_client=GeminiBatchExtractor(),
            batch_size=b_size,
            prompt_version=p_version,
        )

        unprocessed = await db.get_unprocessed_raw_messages(limit=limit or 1000)
        if not unprocessed:
            print("No unprocessed messages found in raw_messages table.")
            # Check if there are any raw messages at all
            all_raw = await db.get_all_raw_messages()
            if not all_raw:
                print("Tip: Run 'python -m ingest.cli seed-raw-messages' to seed raw messages from fixtures.")
            return

        print(f"Found {len(unprocessed)} unprocessed messages. Starting batch extraction...\n")
        extractions, metrics = await pipeline.process_batch_messages(unprocessed)

        print("\n==================== EXTRACTION RUN REPORT ====================")
        print(f"Total Messages Processed:   {metrics.total_messages}")
        print(f"Filtered (Non-Listings):    {metrics.filtered_non_listings} ({metrics.filter_rate:.1f}%)")
        print(f"Cache Hits (0 API cost):    {metrics.cached_hits}")
        print(f"LLM Candidates:             {metrics.llm_candidate_count}")
        print(f"LLM Batches Sent:           {metrics.llm_batches_sent}")
        print(f"Outbound Requests Consumed: {metrics.llm_requests_consumed}")
        print(f"Extractions Saved to DB:    {metrics.extractions_saved}")
        print(f"Dedup Jobs Enqueued:        {metrics.jobs_enqueued}")
        if metrics.llm_requests_consumed > 0:
            print(f"Request Compression Ratio:  {metrics.request_compression_ratio:.1f} msgs / request")
        print("===============================================================\n")

    finally:
        await db.close()


async def run_regex_stats_command(limit: Optional[int] = None) -> None:
    """Calculates and displays the Pass 1 Regex hit rate on the raw corpus."""
    setup_logging(level="ERROR", log_format="pretty")
    db = Database(settings.DATABASE_URL)
    await db.connect()

    try:
        from ingest.extract.regex_rules import run_regex_pass

        messages = await db.get_all_raw_messages(limit=limit)
        if not messages:
            # Fall back to queue fixtures if DB is empty
            fixture_path = Path("fixtures/queue.json")
            if fixture_path.exists():
                data = json.loads(fixture_path.read_text("utf-8"))
                from ingest.db import RawMessage
                messages = [
                    RawMessage(
                        id=item["rawMessage"]["id"],
                        channel_id=item["rawMessage"]["channelId"],
                        message_id=item["rawMessage"]["messageId"],
                        grouped_id=None,
                        raw_text=item["rawMessage"]["rawText"],
                        media_refs=item["rawMessage"].get("mediaRefs", []),
                        posted_at=datetime.fromisoformat(item["rawMessage"]["postedAt"].replace("Z", "+00:00")),
                    )
                    for item in data.get("items", [])
                    if "rawMessage" in item
                ]

        total = len(messages)
        if total == 0:
            print("No raw messages available to analyze.")
            return

        with_price = 0
        with_phone = 0
        with_both = 0
        with_handles = 0
        potential_listings = 0

        for msg in messages:
            res = run_regex_pass(msg.raw_text)
            if res.has_price_token:
                with_price += 1
            if res.has_phone_token:
                with_phone += 1
            if res.has_price_token and res.has_phone_token:
                with_both += 1
            if res.has_handle_token:
                with_handles += 1
            if res.is_potential_listing:
                potential_listings += 1

        print("=================================================================")
        print(f"   PASS 1 REGEX HIT RATE REPORT (Corpus Size: {total} messages)  ")
        print("=================================================================")
        print(f"Messages with Price Token:      {with_price:5d} / {total}  ({with_price / total * 100.0:5.1f}%)")
        print(f"Messages with Phone Token:      {with_phone:5d} / {total}  ({with_phone / total * 100.0:5.1f}%)")
        print(f"Messages with BOTH Price+Phone: {with_both:5d} / {total}  ({with_both / total * 100.0:5.1f}%)")
        print(f"Messages with Telegram Handles: {with_handles:5d} / {total}  ({with_handles / total * 100.0:5.1f}%)")
        print(f"Classified as Potential Listing:{potential_listings:5d} / {total}  ({potential_listings / total * 100.0:5.1f}%)")
        print(f"Filtered as Non-Listings (No LLM): {total - potential_listings:5d} / {total}  ({(total - potential_listings) / total * 100.0:5.1f}%)")
        print("=================================================================")

    finally:
        await db.close()


async def run_spot_check_command(sample_size: int = 30) -> None:
    """Executes a manual spot check of 30 extractions with detailed audit breakdown."""
    setup_logging(level="ERROR", log_format="pretty")
    db = Database(settings.DATABASE_URL)
    await db.connect()

    try:
        from ingest.extract.pipeline import ExtractionPipeline
        from ingest.extract.gemini_client import GeminiBatchExtractor

        messages = await db.get_all_raw_messages(limit=sample_size)
        if not messages:
            # Load sample from queue fixture
            fixture_path = Path("fixtures/queue.json")
            if fixture_path.exists():
                data = json.loads(fixture_path.read_text("utf-8"))
                from ingest.db import RawMessage
                messages = [
                    RawMessage(
                        id=item["rawMessage"]["id"],
                        channel_id=item["rawMessage"]["channelId"],
                        message_id=item["rawMessage"]["messageId"],
                        grouped_id=None,
                        raw_text=item["rawMessage"]["rawText"],
                        media_refs=item["rawMessage"].get("mediaRefs", []),
                        posted_at=datetime.fromisoformat(item["rawMessage"]["postedAt"].replace("Z", "+00:00")),
                    )
                    for item in data.get("items", [])[:sample_size]
                    if "rawMessage" in item
                ]

        if not messages:
            print("No messages available for spot check.")
            return

        pipeline = ExtractionPipeline(
            db=db,
            gemini_client=GeminiBatchExtractor(),
            batch_size=20,
            prompt_version="v1",
        )

        extractions, _ = await pipeline.process_batch_messages(messages)

        print("================================================================================")
        print(f"           MANUAL SPOT-CHECK REPORT (Sample: {len(extractions)} Extractions)     ")
        print("================================================================================")

        correct_price = 0
        correct_phone = 0
        correct_category = 0

        for i, (msg, ext) in enumerate(zip(messages, extractions), start=1):
            raw_snippet = (msg.raw_text or "").replace("\n", " ")[:65]
            title = ext.get("title_en") or ext.get("title_am") or "<No Title / Non-Listing>"
            price = ext.get("price_etb")
            phone = ext.get("phone_normalized")
            category = ext.get("category_slug")
            cond = ext.get("condition")
            loc = ext.get("location_area")
            conf = ext.get("confidence_score", 0.0)

            print(f"\n[{i:02d}] RAW: {raw_snippet}...")
            print(f"     TITLE:    {title}")
            print(f"     PRICE:    {f'{price:,} ETB' if price else 'None'}")
            print(f"     PHONE:    {phone or 'None'}")
            print(f"     CATEGORY: {category} | CONDITION: {cond} | LOC: {loc}")
            print(f"     CONFIDENCE: {conf:.2f}")

            if price is not None:
                correct_price += 1
            if phone is not None:
                correct_phone += 1
            if category is not None:
                correct_category += 1

        print("\n--------------------------------------------------------------------------------")
        print(f"Spot-Check Summary: {len(extractions)} items evaluated.")
        print(f"• Price Extracted:    {correct_price}/{len(extractions)} ({correct_price/len(extractions)*100:.1f}%)")
        print(f"• Phone Normalized:   {correct_phone}/{len(extractions)} ({correct_phone/len(extractions)*100:.1f}%)")
        print(f"• Category Assigned:  {correct_category}/{len(extractions)} ({correct_category/len(extractions)*100:.1f}%)")
        print("================================================================================\n")

    finally:
        await db.close()


async def run_confidence_histogram_command() -> None:
    """Generates an ASCII confidence distribution histogram."""
    setup_logging(level="ERROR", log_format="pretty")
    db = Database(settings.DATABASE_URL)
    await db.connect()

    try:
        from ingest.extract.pipeline import ExtractionPipeline
        from ingest.extract.gemini_client import GeminiBatchExtractor

        messages = await db.get_all_raw_messages()
        if not messages:
            fixture_path = Path("fixtures/queue.json")
            if fixture_path.exists():
                data = json.loads(fixture_path.read_text("utf-8"))
                from ingest.db import RawMessage
                messages = [
                    RawMessage(
                        id=item["rawMessage"]["id"],
                        channel_id=item["rawMessage"]["channelId"],
                        message_id=item["rawMessage"]["messageId"],
                        grouped_id=None,
                        raw_text=item["rawMessage"]["rawText"],
                        media_refs=item["rawMessage"].get("mediaRefs", []),
                        posted_at=datetime.fromisoformat(item["rawMessage"]["postedAt"].replace("Z", "+00:00")),
                    )
                    for item in data.get("items", [])
                    if "rawMessage" in item
                ]

        if not messages:
            print("No messages available for histogram.")
            return

        pipeline = ExtractionPipeline(
            db=db,
            gemini_client=GeminiBatchExtractor(),
            batch_size=20,
            prompt_version="v1",
        )

        _, metrics = await pipeline.process_batch_messages(messages)
        histogram = metrics.get_confidence_histogram()

        print("=============================================================")
        print("            CONFIDENCE DISTRIBUTION HISTOGRAM                ")
        print("=============================================================")
        max_count = max(histogram.values()) if histogram.values() else 1
        for bin_label, count in histogram.items():
            bar_len = int(count / max(max_count, 1) * 35)
            bar = "█" * bar_len
            pct = (count / len(messages) * 100.0) if messages else 0.0
            print(f"{bin_label} | {bar:<35} | {count:4d} ({pct:5.1f}%)")
        print("=============================================================")
        print(f"Auto-publish threshold recommended: >= {settings.AUTO_PUBLISH_CONFIDENCE_THRESHOLD:.2f}")
        print("=============================================================\n")

    finally:
        await db.close()


async def run_verify_pii_command() -> None:
    """Verifies that 0 Ethiopian phone numbers exist in outbound Gemini payloads."""
    setup_logging(level="INFO", log_format="pretty")
    from ingest.extract.pii import assert_zero_pii, sanitize_message_pii
    from ingest.extract.gemini_client import GeminiBatchExtractor

    sample_texts = [
        "አዲስ iPhone 14 Pro Max 256GB sealed ዋጋ 145,000 ብር ስልክ 0911223344 ቦሌ inbox @addis_seller",
        "የቤት ሶፋ ዋጋ 28ሺ ብር ይደውሉ +251 912 345 678 ወይም t.me/furnitureseller",
        "Safaricom SIM phone 07 12 34 56 78 price 12000 br fixed",
    ]

    print("=================================================================")
    print("           SECURITY AUDIT: ZERO PII PAYLOAD VERIFICATION         ")
    print("=================================================================")

    sanitized_items = []
    for i, raw in enumerate(sample_texts, start=1):
        print(f"\n[RAW MESSAGE {i}]:")
        print(f"  {raw}")
        s = sanitize_message_pii(raw, raw_message_id=i, index=i)
        print(f"[SANITIZED FOR LLM {i}]:")
        print(f"  {s.sanitized_text}")
        print(f"[MAPPINGS SAVED LOCALLY {i}]:")
        print(f"  Phones:  {s.pii_mapping.phones}")
        print(f"  Handles: {s.pii_mapping.handles}")
        sanitized_items.append(
            {
                "index": i,
                "raw_message_id": i,
                "sanitized_text": s.sanitized_text,
                "price_etb": 12000,
            }
        )

    extractor = GeminiBatchExtractor()
    outbound_payload = extractor.format_batch_prompt(sanitized_items)

    print("\n-----------------------------------------------------------------")
    print("FULL OUTBOUND BATCH PAYLOAD TO BE SENT TO GEMINI API:")
    print("-----------------------------------------------------------------")
    print(outbound_payload)
    print("-----------------------------------------------------------------")

    # Run strict assertion
    try:
        assert_zero_pii(outbound_payload)
        print("\n✅ ZERO PII VERIFICATION PASSED: No Ethiopian phone numbers detected in outbound payload.")
    except ValueError as e:
        print(f"\n❌ PII LEAK DETECTED: {e}")
        sys.exit(1)

    print("=================================================================\n")


async def run_seed_corpus_command(count: int = 400, seed: int = 20260819) -> None:
    """Generates a synthetic but realistic corpus into raw_messages.

    Writes posts only; the normal `extract` and `dedup-run` commands turn them
    into listings, so the generated data exercises the same classifier, price
    regex and dedup logic as real Telegram traffic. Idempotent on
    (channel_id, message_id), so re-running with the same seed replaces rather
    than duplicates.
    """
    from ingest.seed_corpus import seed_corpus

    setup_logging(level=settings.LOG_LEVEL, log_format=settings.LOG_FORMAT)
    db = Database(settings.DATABASE_URL)
    await db.connect()
    try:
        channels = await db.get_active_channels()
        if not channels:
            await run_seed_channels_command()
            channels = await db.get_active_channels()

        inserted = await seed_corpus(
            db, count=count, channel_ids=[c.id for c in channels], seed=seed
        )
        print(f"\n✓ Seeded {inserted} generated messages into raw_messages.")
        print("  Next: python -m ingest.cli extract && python -m ingest.cli dedup-run")
    finally:
        await db.close()


async def run_seed_raw_messages_command(fixture_path: Optional[str] = None) -> None:
    """Seeds realistic raw messages from fixtures into raw_messages table."""
    setup_logging(level=settings.LOG_LEVEL, log_format=settings.LOG_FORMAT)
    db = Database(settings.DATABASE_URL)
    await db.connect()

    inserted = 0
    try:
        # First ensure channels are seeded
        channels = await db.get_active_channels()
        if not channels:
            await run_seed_channels_command()
            channels = await db.get_active_channels()

        channel_id_map = {c.id: c.id for c in channels}
        fallback_ch_id = channels[0].id if channels else 1

        # 1. Load queue.json
        q_path = Path("fixtures/queue.json").resolve()
        if q_path.exists():
            q_data = json.loads(q_path.read_text("utf-8"))
            for item in q_data.get("items", []):
                raw_msg = item.get("rawMessage")
                if not raw_msg:
                    continue
                msg_id = int(raw_msg.get("messageId") or item.get("id"))
                channel_id = channel_id_map.get(raw_msg.get("channelId"), fallback_ch_id)
                raw_text = raw_msg.get("rawText", "")
                media_refs = raw_msg.get("mediaRefs", [])
                posted_at_str = raw_msg.get("postedAt", "2026-08-16T08:00:00Z")
                posted_at = datetime.fromisoformat(posted_at_str.replace("Z", "+00:00"))

                await db.upsert_raw_message(
                    channel_id=channel_id,
                    message_id=msg_id,
                    grouped_id=raw_msg.get("groupedId"),
                    raw_text=raw_text,
                    media_refs=media_refs,
                    posted_at=posted_at,
                )
                inserted += 1

        # 2. Load listings.json (creating raw message representations)
        l_path = Path(fixture_path or "fixtures/listings.json").resolve()
        if l_path.exists():
            l_data = json.loads(l_path.read_text("utf-8"))
            for i, listing in enumerate(l_data.get("listings", []), start=1000):
                desc = listing.get("description", "")
                phone = listing.get("seller", {}).get("phoneMasked", "0911223344")
                phone_clean = phone.replace("*", "5").replace(" ", "")
                handle = listing.get("seller", {}).get("telegramHandle", "addis_market")
                raw_text = f"{listing.get('title', '')}\n{desc}\nስልክ: {phone_clean} @{handle}"
                images = [img.get("url") for img in listing.get("images", [])]

                channel_id = channels[(i % len(channels))].id if channels else fallback_ch_id
                posted_at = datetime.now(timezone.utc)

                await db.upsert_raw_message(
                    channel_id=channel_id,
                    message_id=i,
                    grouped_id=None,
                    raw_text=raw_text,
                    media_refs=images,
                    posted_at=posted_at,
                )
                inserted += 1

        print(f"Successfully seeded {inserted} raw messages into raw_messages table.")
    finally:
        await db.close()



async def run_seed_synonyms_command() -> None:
    """Seeds the transliteration synonym table with ~200 common item terms."""
    setup_logging(level=settings.LOG_LEVEL, log_format=settings.LOG_FORMAT)
    db = Database(settings.DATABASE_URL)
    await db.connect()

    try:
        from ingest.search.synonyms_data import SYNONYMS_DATA
        count = await db.seed_search_synonyms(SYNONYMS_DATA)
        print(f"✓ Successfully seeded/synced {count} transliteration synonyms into search_synonyms table.")
    finally:
        await db.close()


async def run_dedup_command() -> None:
    """Executes three-signal deduplication and clustering over extracted listings."""
    setup_logging(level=settings.LOG_LEVEL, log_format=settings.LOG_FORMAT)
    db = Database(settings.DATABASE_URL)
    await db.connect()

    print("==================================================")
    print("   Gulit Ingest — Three-Signal Deduplication      ")
    print("==================================================")
    print("Signals: 1) Phone+Price  2) Hero Image pHash  3) text-embedding-004")
    print("--------------------------------------------------")

    try:
        # Ensure standard taxonomy categories are seeded
        l_path = Path("fixtures/listings.json").resolve()
        if l_path.exists():
            l_data = json.loads(l_path.read_text("utf-8"))
            cats = l_data.get("categories", [])
            if cats:
                # Ensure 'other' category is included
                if not any(c.get("slug") == "other" for c in cats):
                    cats.append({"slug": "other", "label": "Other", "labelAm": "ሌሎች"})
                await db.seed_categories(cats)


        from ingest.dedup.cluster import DeduplicationService
        service = DeduplicationService(db=db)
        clusters, report = await service.run_clustering()


        print("\n==================== DEDUP CLUSTERING REPORT ====================")
        print(f"Total Extractions Evaluated:   {report.total_extractions_evaluated}")
        print(f"Canonical Listings Created:    {report.canonical_clusters_formed}")
        print(f"Cross-Channel Clusters Found:  {report.cross_channel_clusters_count}")
        print(f"Max Channels in Single Cluster:{report.max_channels_single_cluster}")
        print(f"Auto-Merges Completed:         {report.auto_merges_count}")
        print(f"Borderline Reviews Flagged:    {report.borderline_flagged_count}")
        if report.multi_channel_clusters:
            print("\nSample Multi-Channel Clusters:")
            for i, c in enumerate(report.multi_channel_clusters[:5], start=1):
                print(f"  [{i}] {c['title']} | Seen in {c['seen_in_channels']} channels | Lowest Price: {c['lowest_price_etb']:,} ETB | Phone: {c['phone']}")
        print("=================================================================\n")
    finally:
        await db.close()


async def run_seed_cross_channel_demo_command() -> None:

    """Seeds intentional cross-channel duplicate listings spanning 2, 3, and 4 channels for demo."""
    setup_logging(level=settings.LOG_LEVEL, log_format=settings.LOG_FORMAT)
    db = Database(settings.DATABASE_URL)
    await db.connect()

    try:
        channels = await db.get_active_channels()
        if len(channels) < 4:
            await run_seed_channels_command()
            channels = await db.get_active_channels()

        ch_ids = [c.id for c in channels]
        fallback_ch = ch_ids[0] if ch_ids else 1

        # Scenario 1: Same Italian L-Shape Sofa cross-posted to 4 channels with varying prices
        sofa_posts = [
            {"ch": ch_ids[0] if len(ch_ids) > 0 else fallback_ch, "msg_id": 9001, "price": 24000, "text": "ባለ 3 ሰው L-Shape የሳሎን ሶፋ ዘመናዊ ከነ ጠረጴዛው ዋጋ 24,000 ብር ስልክ 0911223344 ቦሌ @sofa_seller"},
            {"ch": ch_ids[1] if len(ch_ids) > 1 else fallback_ch, "msg_id": 9002, "price": 23500, "text": "ዘመናዊ L-Shape ሶፋ እና ጠረጴዛ ዋጋ 23,500 ብር ይደውሉ 0911223344 ቦሌ @sofa_seller"},
            {"ch": ch_ids[2] if len(ch_ids) > 2 else fallback_ch, "msg_id": 9003, "price": 25000, "text": "Three-seater Italian L-Shape Sofa with table price 25,000 birr call +251 911 22 33 44 Bole @sofa_seller"},
            {"ch": ch_ids[3] if len(ch_ids) > 3 else fallback_ch, "msg_id": 9004, "price": 24500, "text": "L-ቅርጽ የሳሎን ሶፋ ከነ ትራሱ እና ጠረጴዛው ዋጋ 24,500 ETB ስልክ 0911223344 @sofa_seller"},
        ]

        for p in sofa_posts:
            raw_id = await db.upsert_raw_message(
                channel_id=p["ch"],
                message_id=p["msg_id"],
                grouped_id=None,
                raw_text=p["text"],
                media_refs=["/img/items/sofa_cluster_hero.jpg"],
                posted_at=datetime.now(timezone.utc),
            )
            await db.insert_extraction(
                {
                    "raw_message_id": raw_id,
                    "prompt_version": "v1",
                    "title_en": "Italian L-Shape Living Room Sofa Set with Table",
                    "title_am": "ባለ 3 ሰው L-Shape የሳሎን ሶፋ ከነ ጠረጴዛው",
                    "description_en": "Modern Italian L-shape 3-seater sofa with center table and matching cushions.",
                    "description_am": "ዘመናዊ የሳሎን ሶፋ ከነ ጠረጴዛው እና ከነ ትራሱ በጣም ፅዱ የሆነ።",
                    "price_etb": p["price"],
                    "negotiable": True,
                    "category_slug": "furniture",
                    "condition": "lightly_used",
                    "location_area": "Bole",
                    "location_city": "Addis Ababa",
                    "phone_raw": "0911223344",
                    "phone_normalized": "+251911223344",
                    "confidence_score": 0.95,
                }
            )

        # Scenario 2: Samsung 55-inch TV cross-posted to 3 channels
        tv_posts = [
            {"ch": ch_ids[0] if len(ch_ids) > 0 else fallback_ch, "msg_id": 9011, "price": 38000, "text": "Samsung 55 inch 4K Crystal UHD Smart TV sealed ዋጋ 38,000 ብር ስልክ 0922334455 @tv_shop"},
            {"ch": ch_ids[1] if len(ch_ids) > 1 else fallback_ch, "msg_id": 9012, "price": 36500, "text": "ሳምሱንግ 55 ኢንች 4K ስማርት ቲቪ በፓኬት ያለ ዋጋ 36,500 ብር ይደውሉ 0922334455 @tv_shop"},
            {"ch": ch_ids[2] if len(ch_ids) > 2 else fallback_ch, "msg_id": 9013, "price": 37000, "text": "Samsung 55 4K Smart TV in box 37,000 birr call +251 922 33 44 55 @tv_shop"},
        ]

        for p in tv_posts:
            raw_id = await db.upsert_raw_message(
                channel_id=p["ch"],
                message_id=p["msg_id"],
                grouped_id=None,
                raw_text=p["text"],
                media_refs=["/img/items/tv_cluster_hero.jpg"],
                posted_at=datetime.now(timezone.utc),
            )
            await db.insert_extraction(
                {
                    "raw_message_id": raw_id,
                    "prompt_version": "v1",
                    "title_en": "Samsung 55-inch 4K Crystal UHD Smart TV (Sealed)",
                    "title_am": "ሳምሱንግ 55 ኢንች 4K ስማርት ቲቪ",
                    "description_en": "Brand new sealed Samsung 55 inch 4K Crystal UHD Smart TV with magic remote.",
                    "description_am": "ያልተከፈተ አዲስ በካርቶን ያለ ሳምሱንግ 55 ኢንች 4K ስማርት ቴሌቪዥን።",
                    "price_etb": p["price"],
                    "negotiable": False,
                    "category_slug": "tv-audio",
                    "condition": "brand_new",
                    "location_area": "Bole",
                    "location_city": "Addis Ababa",
                    "phone_raw": "0922334455",
                    "phone_normalized": "+251922334455",
                    "confidence_score": 0.96,
                }
            )

        print("✓ Successfully seeded cross-channel demo listings (4-channel sofa cluster & 3-channel TV cluster).")
    finally:
        await db.close()



async def run_search_command(query: str, category: Optional[str] = None, explain: bool = False) -> None:
    """Executes hybrid bilingual search and prints ranked results."""
    setup_logging(level="ERROR", log_format="pretty")
    db = Database(settings.DATABASE_URL)
    await db.connect()

    try:
        from ingest.search.engine import BilingualSearchEngine
        engine = BilingualSearchEngine(db=db)
        resp = await engine.search(query=query, category=category, explain=explain)

        print("================================================================================")
        print(f" SEARCH RESULTS for: '{resp.query}' | Found: {resp.total_results} in {resp.duration_ms:.2f}ms")
        print(f" Method Used: {resp.method_used}")
        print(f" Expanded Tokens: {resp.expanded_tokens}")
        print("================================================================================")

        for i, item in enumerate(resp.results[:10], start=1):
            title = item.title_en or item.title_am or "<No title>"
            price_str = f"{item.price_etb:,} ETB" if item.price_etb else "Price unlisted"
            lowest_str = f" (Lowest: {item.lowest_price_etb:,} ETB)" if item.lowest_price_etb and item.lowest_price_etb != item.price_etb else ""
            seen_str = f"Seen in {item.seen_in_channels} channel{'s' if item.seen_in_channels > 1 else ''}"
            print(f"[{i:02d}] {title}")
            print(f"     Price: {price_str}{lowest_str} | Category: {item.category_slug} | Location: {item.location_area or 'Addis Ababa'}")
            print(f"     Score: {item.score:.3f} | {seen_str} | Method: {item.search_method}")

        if resp.explain_plan:
            print("\n------------------------- EXPLAIN ANALYZE PLAN -------------------------")
            print(resp.explain_plan)
        print("================================================================================\n")
    finally:
        await db.close()


async def run_search_demo_command() -> None:
    """Demonstrates that sofa, ሶፋ, and soffa return identical result sets."""
    setup_logging(level="ERROR", log_format="pretty")
    db = Database(settings.DATABASE_URL)
    await db.connect()

    try:
        from ingest.search.engine import BilingualSearchEngine
        engine = BilingualSearchEngine(db=db)

        test_queries = ["sofa", "ሶፋ", "soffa"]
        query_results = {}

        print("================================================================================")
        print("   DEMO VERIFICATION: BILINGUAL TRANSLITERATION SEARCH CONSISTENCY              ")
        print("================================================================================")

        for q in test_queries:
            resp = await engine.search(query=q)
            slugs = [r.slug for r in resp.results]
            query_results[q] = {
                "total": resp.total_results,
                "duration_ms": resp.duration_ms,
                "slugs": slugs,
                "titles": [r.title_en for r in resp.results[:3]],
            }
            print(f"\nQuery: '{q}'")
            print(f"  • Results Count: {resp.total_results}")
            print(f"  • Latency:       {resp.duration_ms:.2f}ms")
            print(f"  • Expanded:      {resp.expanded_tokens}")
            print(f"  • Top Titles:    {query_results[q]['titles']}")

        # Compare result sets
        slugs_sofa = set(query_results["sofa"]["slugs"])
        slugs_am = set(query_results["ሶፋ"]["slugs"])
        slugs_translit = set(query_results["soffa"]["slugs"])

        identical = (slugs_sofa == slugs_am == slugs_translit) and len(slugs_sofa) > 0

        print("\n--------------------------------------------------------------------------------")
        if identical:
            print("✅ DEMO TEST PASSED: 'sofa', 'ሶፋ', and 'soffa' return IDENTICAL result sets!")
        else:
            print(f"Result sets: sofa={len(slugs_sofa)}, ሶፋ={len(slugs_am)}, soffa={len(slugs_translit)}")
        print("================================================================================\n")
    finally:
        await db.close()


async def run_search_benchmark_command() -> None:
    """Measures search latency across multiple query types with EXPLAIN ANALYZE."""
    setup_logging(level="ERROR", log_format="pretty")
    db = Database(settings.DATABASE_URL)
    await db.connect()

    try:
        from ingest.search.engine import BilingualSearchEngine
        engine = BilingualSearchEngine(db=db)

        queries = ["iPhone", "ላፕቶፕ", "soffa", "Toyota Vitz", "shoes", "ፍሪጅ"]
        print("================================================================================")
        print("           SEARCH LATENCY BENCHMARK (< 200ms TARGET)                           ")
        print("================================================================================")

        durations = []
        for q in queries:
            resp = await engine.search(query=q, explain=True)
            durations.append(resp.duration_ms)
            status_icon = "✓" if resp.duration_ms < 200.0 else "⚠️"
            print(f"{status_icon} Query: '{q:<15}' | Time: {resp.duration_ms:6.2f}ms | Results: {resp.total_results:3d} | Method: {resp.method_used}")

        avg_ms = sum(durations) / len(durations)
        max_ms = max(durations)
        print("--------------------------------------------------------------------------------")
        print(f"Average Latency: {avg_ms:.2f}ms | Max Latency: {max_ms:.2f}ms | Latency Target (<200ms): {'PASSED' if max_ms < 200.0 else 'FAILED'}")
        print("================================================================================\n")
    finally:
        await db.close()


async def run_semantic_fallback_command(query: str) -> None:
    """Tests semantic vector search fallback for natural language descriptive queries."""
    setup_logging(level="ERROR", log_format="pretty")
    db = Database(settings.DATABASE_URL)
    await db.connect()

    try:
        from ingest.search.engine import BilingualSearchEngine
        engine = BilingualSearchEngine(db=db)

        print("================================================================================")
        print(f"   SEMANTIC VECTOR SEARCH FALLBACK: '{query}'                                   ")
        print("================================================================================")

        resp = await engine.search(query=query)
        print(f"Method triggered: {resp.method_used} (Duration: {resp.duration_ms:.2f}ms)\n")

        for i, item in enumerate(resp.results[:8], start=1):
            title = item.title_en or item.title_am
            price = f"{item.price_etb:,} ETB" if item.price_etb else "N/A"
            print(f"[{i}] {title}")
            print(f"    Category: {item.category_slug} | Price: {price} | Cosine Similarity: {item.score:.3f}")
        print("================================================================================\n")
    finally:
        await db.close()


def main() -> None:
    """Main CLI parser."""
    parser = argparse.ArgumentParser(
        prog="python -m ingest.cli",
        description="Gulit Telegram Ingestion, Extraction & Intelligence Service CLI",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Ingestion subcommands
    auth_parser = subparsers.add_parser("auth", help="Interactive Telegram authentication for burner number")
    auth_parser.add_argument("--phone", "-p", help="Burner phone number in international format (+251...)")
    subparsers.add_parser("listen", help="Start the live Telegram event listener daemon")

    backfill_parser = subparsers.add_parser("backfill", help="Run historical channel backfill")
    backfill_parser.add_argument("--channel", "-c", help="Target a specific channel (@username or Telegram ID)")
    backfill_parser.add_argument("--since", "-s", help="Backfill boundary: e.g. '7d', '30d', '2026-08-01'")
    backfill_parser.add_argument("--limit", "-l", type=int, help="Maximum messages to fetch per channel")
    backfill_parser.add_argument("--batch-size", "-b", type=int, default=100, help="Batch pagination size")
    backfill_parser.add_argument("--force-full", action="store_true", help="Ignore last_message_id and re-fetch history")

    subparsers.add_parser("status", help="Print status report of allowlisted channels and raw message counts")

    seed_parser = subparsers.add_parser("seed-channels", help="Seed channels table from fixtures/channels.json")
    seed_parser.add_argument("--file", "-f", help="Path to channels JSON file (default: fixtures/channels.json)")

    seed_corpus_parser = subparsers.add_parser("seed-corpus", help="Generate a realistic synthetic corpus into raw_messages")
    seed_corpus_parser.add_argument("--count", type=int, default=400, help="Approximate number of listings to generate")
    seed_corpus_parser.add_argument("--seed", type=int, default=20260819, help="RNG seed; same seed regenerates the same corpus")

    seed_raw_parser = subparsers.add_parser("seed-raw-messages", help="Seed raw_messages table from fixtures/queue.json")
    seed_raw_parser.add_argument("--file", "-f", help="Path to queue JSON file (default: fixtures/queue.json)")

    # Extraction subcommands
    extract_parser = subparsers.add_parser("extract", help="Run two-pass extraction pipeline with PII stripping & batched Gemini calls")
    extract_parser.add_argument("--limit", "-l", type=int, help="Maximum messages to extract")
    extract_parser.add_argument("--batch-size", "-b", type=int, default=20, help="Batch size for Gemini requests (default: 20)")
    extract_parser.add_argument("--prompt-version", "-v", default="v1", help="Prompt version (default: v1)")

    regex_parser = subparsers.add_parser("regex-stats", help="Compute Pass 1 Regex hit rate on raw corpus (price pct, phone pct, both pct)")
    regex_parser.add_argument("--limit", "-l", type=int, help="Limit number of messages to analyze")

    spot_parser = subparsers.add_parser("spot-check", help="Manual spot check of 30 extractions with accuracy report")
    spot_parser.add_argument("--sample", "-n", type=int, default=30, help="Number of items to spot check (default: 30)")

    subparsers.add_parser("confidence-histogram", help="Display ASCII confidence score distribution histogram")
    subparsers.add_parser("verify-pii", help="Verify 0 Ethiopian phone numbers in outbound Gemini payload")

    # Dedup & Search subcommands
    subparsers.add_parser("seed-synonyms", help="Seed 200+ transliteration search synonyms into search_synonyms table")
    subparsers.add_parser("seed-cross-channel-demo", help="Seed intentional cross-channel multi-post duplicates for demo")
    subparsers.add_parser("dedup-run", help="Run three-signal deduplication clustering and populate listings table")
    subparsers.add_parser("dedup-report", help="Print deduplication report and multi-channel cluster stats")

    search_parser = subparsers.add_parser("search", help="Execute hybrid bilingual search query")
    search_parser.add_argument("--query", "-q", required=True, help="Search query string")
    search_parser.add_argument("--category", "-c", help="Category slug filter")
    search_parser.add_argument("--explain", action="store_true", help="Include EXPLAIN ANALYZE query plan")

    subparsers.add_parser("search-demo", help="Demonstrate that sofa, ሶፋ, and soffa return identical result sets")
    subparsers.add_parser("search-benchmark", help="Measure search query latency with EXPLAIN ANALYZE (< 200ms target)")

    sem_parser = subparsers.add_parser("test-semantic-fallback", help="Test semantic vector fallback on descriptive queries")
    sem_parser.add_argument("--query", "-q", default="something to sit on", help="Natural language descriptive query")

    args = parser.parse_args()

    try:
        if args.command == "auth":
            asyncio.run(run_auth_command(phone=args.phone))
        elif args.command == "listen":
            asyncio.run(run_listen_command())
        elif args.command == "backfill":
            asyncio.run(
                run_backfill_command(
                    channel=args.channel,
                    since=args.since,
                    limit=args.limit,
                    batch_size=args.batch_size,
                    force_full=args.force_full,
                )
            )
        elif args.command == "status":
            asyncio.run(run_status_command())
        elif args.command == "seed-channels":
            asyncio.run(run_seed_channels_command(fixture_path=args.file))
        elif args.command == "seed-corpus":
            asyncio.run(run_seed_corpus_command(count=args.count, seed=args.seed))
        elif args.command == "seed-raw-messages":
            asyncio.run(run_seed_raw_messages_command(fixture_path=args.file))
        elif args.command == "extract":
            asyncio.run(
                run_extract_command(
                    limit=args.limit,
                    batch_size=args.batch_size,
                    prompt_version=args.prompt_version,
                )
            )
        elif args.command == "regex-stats":
            asyncio.run(run_regex_stats_command(limit=args.limit))
        elif args.command == "spot-check":
            asyncio.run(run_spot_check_command(sample_size=args.sample))
        elif args.command == "confidence-histogram":
            asyncio.run(run_confidence_histogram_command())
        elif args.command == "verify-pii":
            asyncio.run(run_verify_pii_command())
        elif args.command == "seed-synonyms":
            asyncio.run(run_seed_synonyms_command())
        elif args.command == "seed-cross-channel-demo":
            asyncio.run(run_seed_cross_channel_demo_command())
        elif args.command == "dedup-run":
            asyncio.run(run_dedup_command())
        elif args.command == "dedup-report":
            asyncio.run(run_dedup_command())
        elif args.command == "search":
            asyncio.run(run_search_command(query=args.query, category=args.category, explain=args.explain))
        elif args.command == "search-demo":
            asyncio.run(run_search_demo_command())
        elif args.command == "search-benchmark":
            asyncio.run(run_search_benchmark_command())
        elif args.command == "test-semantic-fallback":
            asyncio.run(run_semantic_fallback_command(query=args.query))

    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")
        sys.exit(0)
    except Exception as e:
        from ingest.client import MissingTelegramCredentialsError, SessionNotAuthorizedError
        from ingest.db import DatabaseConnectionError

        if isinstance(e, (MissingTelegramCredentialsError, SessionNotAuthorizedError, DatabaseConnectionError)):
            print(f"\n❌ {e}\n", file=sys.stderr)
            sys.exit(1)
        raise


if __name__ == "__main__":
    main()


