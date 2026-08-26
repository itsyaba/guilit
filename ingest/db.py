"""PostgreSQL database operations for ingestion using psycopg (v3)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional, Sequence
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from ingest.config import settings
from ingest.logging_utils import get_logger

logger = get_logger("ingest.db")


@dataclass
class Channel:
    """Represents a row in the channels table."""

    id: int
    telegram_id: int
    username: str
    title: str
    active: bool
    last_message_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass
class RawMessage:
    """Represents a row in the raw_messages table."""

    id: Optional[int]
    channel_id: int
    message_id: int
    grouped_id: Optional[int]
    raw_text: Optional[str]
    media_refs: Optional[List[str]]
    posted_at: datetime
    processed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class DatabaseConnectionError(Exception):
    """Raised when connecting to PostgreSQL fails."""
    pass


class Database:
    """Asynchronous PostgreSQL client for the ingest pipeline."""

    def __init__(
        self,
        conninfo: Optional[str] = None,
        min_size: Optional[int] = None,
        max_size: Optional[int] = None,
    ) -> None:
        self.conninfo = conninfo or settings.DATABASE_URL
        self.min_size = min_size or settings.DB_POOL_MIN_SIZE
        self.max_size = max_size or settings.DB_POOL_MAX_SIZE
        self._pool: Optional[AsyncConnectionPool] = None

    async def connect(self) -> None:
        """Initializes the connection pool with immediate timeout checks."""
        if self._pool is None:
            self._pool = AsyncConnectionPool(
                conninfo=self.conninfo,
                min_size=self.min_size,
                max_size=self.max_size,
                open=False,
                timeout=5.0,
                kwargs={"row_factory": dict_row, "connect_timeout": 3},
            )
            try:
                await self._pool.open(wait=True, timeout=5.0)
                logger.info("Connected to PostgreSQL connection pool", extra={"min_size": self.min_size, "max_size": self.max_size})
            except Exception as e:
                await self._pool.close()
                self._pool = None
                raise DatabaseConnectionError(
                    f"Unable to connect to PostgreSQL at '{self.conninfo}'.\n"
                    f"Is the database container running? Start it with:\n"
                    f"    docker compose up -d db"
                ) from e


    async def close(self) -> None:
        """Closes the connection pool."""
        if self._pool is not None:
            await self._pool.close()
            self._pool = None
            logger.info("PostgreSQL connection pool closed")

    async def get_active_channels(self) -> List[Channel]:
        """Fetches all active channels from the allowlist."""
        assert self._pool is not None, "Database not connected. Call connect() first."
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT id, telegram_id, username, title, active, last_message_id, created_at, updated_at
                    FROM channels
                    WHERE active = TRUE
                    ORDER BY id ASC
                    """
                )
                rows = await cur.fetchall()
                return [
                    Channel(
                        id=row["id"],
                        telegram_id=row["telegram_id"],
                        username=row["username"],
                        title=row["title"],
                        active=row["active"],
                        last_message_id=row["last_message_id"],
                        created_at=row["created_at"],
                        updated_at=row["updated_at"],
                    )
                    for row in rows
                ]

    async def get_channel_by_id(self, channel_id: int) -> Optional[Channel]:
        """Fetches a channel by its primary key ID."""
        assert self._pool is not None, "Database not connected. Call connect() first."
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT id, telegram_id, username, title, active, last_message_id, created_at, updated_at
                    FROM channels
                    WHERE id = %s
                    """,
                    (channel_id,),
                )
                row = await cur.fetchone()
                if not row:
                    return None
                return Channel(
                    id=row["id"],
                    telegram_id=row["telegram_id"],
                    username=row["username"],
                    title=row["title"],
                    active=row["active"],
                    last_message_id=row["last_message_id"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )

    async def get_channel_by_username_or_tg_id(
        self, identifier: str | int
    ) -> Optional[Channel]:
        """Fetches a channel by username (with or without @) or telegram_id."""
        assert self._pool is not None, "Database not connected. Call connect() first."
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                if isinstance(identifier, int) or (isinstance(identifier, str) and identifier.lstrip("-").isdigit()):
                    tg_id = int(identifier)
                    await cur.execute(
                        """
                        SELECT id, telegram_id, username, title, active, last_message_id, created_at, updated_at
                        FROM channels
                        WHERE telegram_id = %s
                        """,
                        (tg_id,),
                    )
                else:
                    clean_username = str(identifier).lstrip("@").lower()
                    await cur.execute(
                        """
                        SELECT id, telegram_id, username, title, active, last_message_id, created_at, updated_at
                        FROM channels
                        WHERE LOWER(username) = %s
                        """,
                        (clean_username,),
                    )
                row = await cur.fetchone()
                if not row:
                    return None
                return Channel(
                    id=row["id"],
                    telegram_id=row["telegram_id"],
                    username=row["username"],
                    title=row["title"],
                    active=row["active"],
                    last_message_id=row["last_message_id"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )

    async def upsert_raw_message(
        self,
        channel_id: int,
        message_id: int,
        grouped_id: Optional[int],
        raw_text: Optional[str],
        media_refs: Optional[Sequence[str]],
        posted_at: datetime,
    ) -> int:
        """
        Idempotently inserts or updates a raw message.
        Guarantees backfill idempotency on (channel_id, message_id).
        """
        assert self._pool is not None, "Database not connected. Call connect() first."
        
        # Format media_refs for postgres text[] array
        refs_array = list(media_refs) if media_refs is not None else None

        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO raw_messages (
                        channel_id,
                        message_id,
                        grouped_id,
                        raw_text,
                        media_refs,
                        posted_at,
                        created_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (channel_id, message_id)
                    DO UPDATE SET
                        grouped_id = COALESCE(EXCLUDED.grouped_id, raw_messages.grouped_id),
                        raw_text = COALESCE(EXCLUDED.raw_text, raw_messages.raw_text),
                        media_refs = CASE 
                            WHEN EXCLUDED.media_refs IS NOT NULL AND array_length(EXCLUDED.media_refs, 1) > 0 
                            THEN EXCLUDED.media_refs 
                            ELSE raw_messages.media_refs 
                        END,
                        posted_at = EXCLUDED.posted_at
                    RETURNING id;
                    """,
                    (
                        channel_id,
                        message_id,
                        grouped_id,
                        raw_text,
                        refs_array,
                        posted_at,
                    ),
                )
                row = await cur.fetchone()
                assert row is not None
                raw_id = int(row["id"])
            await conn.commit()
            return raw_id

    async def update_channel_last_message_id(
        self, channel_id: int, last_message_id: int
    ) -> None:
        """
        Atomically updates the channel's last_message_id to the max seen message ID.
        """
        assert self._pool is not None, "Database not connected. Call connect() first."
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    UPDATE channels
                    SET last_message_id = GREATEST(COALESCE(last_message_id, 0), %s),
                        updated_at = NOW()
                    WHERE id = %s;
                    """,
                    (last_message_id, channel_id),
                )
            await conn.commit()

    async def upsert_channel(
        self,
        telegram_id: int,
        username: str,
        title: str,
        active: bool = True,
        last_message_id: Optional[int] = None,
    ) -> Channel:
        """
        Inserts or updates a channel in the allowlist.
        """
        assert self._pool is not None, "Database not connected. Call connect() first."
        clean_username = username.lstrip("@")
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO channels (telegram_id, username, title, active, last_message_id, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
                    ON CONFLICT (telegram_id)
                    DO UPDATE SET
                        username = EXCLUDED.username,
                        title = EXCLUDED.title,
                        active = EXCLUDED.active,
                        updated_at = NOW()
                    RETURNING id, telegram_id, username, title, active, last_message_id, created_at, updated_at;
                    """,
                    (telegram_id, clean_username, title, active, last_message_id),
                )
                row = await cur.fetchone()
                assert row is not None
                channel = Channel(
                    id=row["id"],
                    telegram_id=row["telegram_id"],
                    username=row["username"],
                    title=row["title"],
                    active=row["active"],
                    last_message_id=row["last_message_id"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
            await conn.commit()
            return channel

    async def get_ingest_stats(self) -> List[dict]:
        """
        Returns stats per channel: captured raw message count and last message ID.
        """
        assert self._pool is not None, "Database not connected. Call connect() first."
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT 
                        c.id,
                        c.telegram_id,
                        c.username,
                        c.title,
                        c.active,
                        c.last_message_id,
                        COUNT(r.id) AS raw_message_count,
                        MAX(r.posted_at) AS latest_message_posted_at
                    FROM channels c
                    LEFT JOIN raw_messages r ON r.channel_id = c.id
                    GROUP BY c.id, c.telegram_id, c.username, c.title, c.active, c.last_message_id
                    ORDER BY c.id ASC;
                    """
                )
                return await cur.fetchall()

    async def get_unprocessed_raw_messages(self, limit: int = 100) -> List[RawMessage]:
        """Fetches raw messages that have not yet been extracted (processed_at IS NULL)."""
        assert self._pool is not None, "Database not connected. Call connect() first."
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT id, channel_id, message_id, grouped_id, raw_text, media_refs, posted_at, processed_at, created_at
                    FROM raw_messages
                    WHERE processed_at IS NULL
                    ORDER BY posted_at ASC
                    LIMIT %s;
                    """,
                    (limit,),
                )
                rows = await cur.fetchall()
                return [
                    RawMessage(
                        id=row["id"],
                        channel_id=row["channel_id"],
                        message_id=row["message_id"],
                        grouped_id=row["grouped_id"],
                        raw_text=row["raw_text"],
                        media_refs=row["media_refs"],
                        posted_at=row["posted_at"],
                        processed_at=row["processed_at"],
                        created_at=row["created_at"],
                    )
                    for row in rows
                ]

    async def get_all_raw_messages(self, limit: Optional[int] = None) -> List[RawMessage]:
        """Fetches all raw messages from the database."""
        assert self._pool is not None, "Database not connected. Call connect() first."
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                query = "SELECT id, channel_id, message_id, grouped_id, raw_text, media_refs, posted_at, processed_at, created_at FROM raw_messages ORDER BY posted_at ASC"
                params = ()
                if limit:
                    query += " LIMIT %s"
                    params = (limit,)
                await cur.execute(query, params)
                rows = await cur.fetchall()
                return [
                    RawMessage(
                        id=row["id"],
                        channel_id=row["channel_id"],
                        message_id=row["message_id"],
                        grouped_id=row["grouped_id"],
                        raw_text=row["raw_text"],
                        media_refs=row["media_refs"],
                        posted_at=row["posted_at"],
                        processed_at=row["processed_at"],
                        created_at=row["created_at"],
                    )
                    for row in rows
                ]

    async def insert_extraction(self, extraction_data: dict) -> int:
        """Inserts a structured extraction row into extractions table."""
        assert self._pool is not None, "Database not connected. Call connect() first."
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO extractions (
                        raw_message_id,
                        prompt_version,
                        title_en,
                        title_am,
                        description_en,
                        description_am,
                        price_etb,
                        negotiable,
                        category_slug,
                        condition,
                        location_area,
                        location_city,
                        phone_raw,
                        phone_normalized,
                        confidence_score,
                        created_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    RETURNING id;
                    """,
                    (
                        extraction_data["raw_message_id"],
                        extraction_data.get("prompt_version", "v1"),
                        extraction_data.get("title_en"),
                        extraction_data.get("title_am"),
                        extraction_data.get("description_en"),
                        extraction_data.get("description_am"),
                        extraction_data.get("price_etb"),
                        extraction_data.get("negotiable"),
                        extraction_data.get("category_slug"),
                        extraction_data.get("condition"),
                        extraction_data.get("location_area"),
                        extraction_data.get("location_city", "Addis Ababa"),
                        extraction_data.get("phone_raw"),
                        extraction_data.get("phone_normalized"),
                        extraction_data.get("confidence_score", 0.0),
                    ),
                )
                row = await cur.fetchone()
                assert row is not None
                extraction_id = row["id"]
            await conn.commit()
            return extraction_id

    async def mark_raw_message_processed(self, raw_message_id: int) -> None:
        """Sets processed_at = NOW() on a raw message."""
        assert self._pool is not None, "Database not connected. Call connect() first."
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "UPDATE raw_messages SET processed_at = NOW() WHERE id = %s;",
                    (raw_message_id,),
                )
            await conn.commit()

    async def enqueue_job(
        self,
        job_type: str,
        payload: dict,
        run_after: Optional[datetime] = None,
    ) -> int:
        """Enqueues a background job into the jobs queue table."""
        assert self._pool is not None, "Database not connected. Call connect() first."
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO jobs (type, payload, status, attempts, run_after, created_at, updated_at)
                    VALUES (%s, %s, 'pending', 0, COALESCE(%s, NOW()), NOW(), NOW())
                    RETURNING id;
                    """,
                    (job_type, psycopg.types.json.Jsonb(payload), run_after),
                )
                row = await cur.fetchone()
                assert row is not None
                job_id = row["id"]
            await conn.commit()
            return job_id

    async def claim_pending_job(self, job_type: str, worker_id: str) -> Optional[dict]:
        """Claims a pending job atomically using SELECT FOR UPDATE SKIP LOCKED."""
        assert self._pool is not None, "Database not connected. Call connect() first."
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT id, type, payload, attempts, run_after
                    FROM jobs
                    WHERE type = %s
                      AND status = 'pending'
                      AND run_after <= NOW()
                    ORDER BY run_after ASC
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED;
                    """,
                    (job_type,),
                )
                row = await cur.fetchone()
                if not row:
                    return None
                
                job_id = row["id"]
                await cur.execute(
                    """
                    UPDATE jobs
                    SET status = 'running',
                        locked_at = NOW(),
                        locked_by = %s,
                        updated_at = NOW()
                    WHERE id = %s;
                    """,
                    (worker_id, job_id),
                )
            await conn.commit()
            return dict(row)

    async def update_job_status(
        self,
        job_id: int,
        status: str,
        attempts: int,
        run_after: Optional[datetime] = None,
    ) -> None:
        """Updates job status, incrementing attempts and setting run_after."""
        assert self._pool is not None, "Database not connected. Call connect() first."
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    UPDATE jobs
                    SET status = %s,
                        attempts = %s,
                        run_after = COALESCE(%s, run_after),
                        locked_at = NULL,
                        locked_by = NULL,
                        updated_at = NOW()
                    WHERE id = %s;
                    """,
                    (status, attempts, run_after, job_id),
                )
            await conn.commit()

    async def get_extractions_with_raw_messages(self, limit: Optional[int] = None) -> List[dict]:
        """Fetches extractions joined with their parent raw messages for deduplication."""
        assert self._pool is not None, "Database not connected. Call connect() first."
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                query = """
                    SELECT 
                        e.id AS extraction_id,
                        e.raw_message_id,
                        e.title_en,
                        e.title_am,
                        e.description_en,
                        e.description_am,
                        e.price_etb,
                        e.negotiable,
                        e.category_slug,
                        e.condition,
                        e.location_area,
                        e.location_city,
                        e.phone_raw,
                        e.phone_normalized,
                        e.confidence_score,
                        r.channel_id,
                        c.username AS channel_username,
                        c.title AS channel_title,
                        r.message_id,
                        r.grouped_id,
                        r.raw_text,
                        r.media_refs,
                        r.posted_at
                    FROM extractions e
                    JOIN raw_messages r ON r.id = e.raw_message_id
                    JOIN channels c ON c.id = r.channel_id
                    ORDER BY r.posted_at ASC
                """
                params = ()
                if limit:
                    query += " LIMIT %s"
                    params = (limit,)
                await cur.execute(query, params)
                return await cur.fetchall()

    async def upsert_canonical_listing(self, data: dict) -> str:
        """Inserts or updates a canonical listing row and returns its UUID."""
        assert self._pool is not None, "Database not connected. Call connect() first."
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                embedding_val = f"[{','.join(str(x) for x in data['embedding'])}]" if data.get("embedding") else None
                await cur.execute(
                    """
                    INSERT INTO listings (
                        slug,
                        title_en,
                        title_am,
                        description_en,
                        description_am,
                        price_etb,
                        lowest_price_etb,
                        negotiable,
                        category_slug,
                        condition,
                        location_area,
                        location_city,
                        tier,
                        status,
                        extraction_confidence,
                        seen_in_channels,
                        embedding,
                        posted_at,
                        updated_at,
                        created_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'indexed', 'live', %s, %s, %s::vector, %s, NOW(), NOW())
                    ON CONFLICT (slug)
                    DO UPDATE SET
                        title_en = EXCLUDED.title_en,
                        title_am = EXCLUDED.title_am,
                        description_en = EXCLUDED.description_en,
                        description_am = EXCLUDED.description_am,
                        price_etb = EXCLUDED.price_etb,
                        lowest_price_etb = LEAST(listings.lowest_price_etb, EXCLUDED.lowest_price_etb),
                        negotiable = EXCLUDED.negotiable,
                        category_slug = EXCLUDED.category_slug,
                        condition = EXCLUDED.condition,
                        location_area = EXCLUDED.location_area,
                        location_city = EXCLUDED.location_city,
                        extraction_confidence = EXCLUDED.extraction_confidence,
                        seen_in_channels = EXCLUDED.seen_in_channels,
                        embedding = EXCLUDED.embedding,
                        updated_at = NOW()
                    RETURNING id;
                    """,
                    (
                        data["slug"],
                        data["title_en"],
                        data.get("title_am"),
                        data.get("description_en"),
                        data.get("description_am"),
                        data.get("price_etb"),
                        data.get("lowest_price_etb", data.get("price_etb")),
                        data.get("negotiable", False),
                        data.get("category_slug"),
                        data.get("condition"),
                        data.get("location_area"),
                        data.get("location_city", "Addis Ababa"),
                        data.get("extraction_confidence", 0.85),
                        data.get("seen_in_channels", 1),
                        embedding_val,
                        data.get("posted_at", datetime.now(timezone.utc)),
                    ),
                )
                row = await cur.fetchone()
                assert row is not None
                listing_id = str(row["id"])
            await conn.commit()
            return listing_id

    async def upsert_listing_source(
        self,
        listing_id: str,
        raw_message_id: int,
        price_etb: Optional[int],
    ) -> None:
        """Links a source raw message to a canonical listing."""
        assert self._pool is not None, "Database not connected. Call connect() first."
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO listing_sources (listing_id, raw_message_id, price_etb, created_at)
                    VALUES (%s, %s, %s, NOW())
                    ON CONFLICT (listing_id, raw_message_id)
                    DO UPDATE SET price_etb = EXCLUDED.price_etb;
                    """,
                    (listing_id, raw_message_id, price_etb),
                )
            await conn.commit()

    async def upsert_listing_image(
        self,
        listing_id: str,
        r2_key: str,
        phash: Optional[str] = None,
        sort_order: int = 0,
    ) -> None:
        """Inserts or updates a listing image with its perceptual hash."""
        assert self._pool is not None, "Database not connected. Call connect() first."
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO images (listing_id, r2_key, phash, sort_order, created_at)
                    VALUES (%s, %s, %s, %s, NOW())
                    ON CONFLICT (r2_key)
                    DO UPDATE SET phash = COALESCE(EXCLUDED.phash, images.phash), sort_order = EXCLUDED.sort_order;
                    """,
                    (listing_id, r2_key, phash, sort_order),
                )
            await conn.commit()

    async def seed_search_synonyms(self, synonyms: List[dict]) -> int:
        """Bulk upserts transliteration search synonyms."""
        assert self._pool is not None, "Database not connected. Call connect() first."
        count = 0
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                for item in synonyms:
                    await cur.execute(
                        """
                        INSERT INTO search_synonyms (canonical_term, synonym, category_slug, language, created_at)
                        VALUES (%s, %s, %s, %s, NOW())
                        ON CONFLICT (canonical_term, synonym) DO NOTHING;
                        """,
                        (
                            item["canonical_term"],
                            item["synonym"],
                            item.get("category_slug"),
                            item.get("language", "mixed"),
                        ),
                    )
                    count += 1
            await conn.commit()
            return count

    async def get_all_synonyms(self) -> List[dict]:
        """Retrieves all synonyms from search_synonyms table."""
        assert self._pool is not None, "Database not connected. Call connect() first."
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT canonical_term, synonym, category_slug, language FROM search_synonyms ORDER BY canonical_term ASC;"
                )
                return await cur.fetchall()

    async def seed_categories(self, categories_list: List[dict]) -> int:
        """Seeds the standard taxonomy categories into categories table."""
        assert self._pool is not None, "Database not connected. Call connect() first."
        count = 0
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                for cat in categories_list:
                    await cur.execute(
                        """
                        INSERT INTO categories (slug, name_en, name_am, parent, created_at)
                        VALUES (%s, %s, %s, %s, NOW())
                        ON CONFLICT (slug)
                        DO UPDATE SET name_en = EXCLUDED.name_en, name_am = EXCLUDED.name_am;
                        """,
                        (cat["slug"], cat["label"], cat["labelAm"], cat.get("parent")),
                    )
                    count += 1
            await conn.commit()
            return count



