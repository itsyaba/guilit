"""Historical Telegram channel backfill service with album grouping and resumability."""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator, List, Optional, Sequence, Union

from telethon.errors import FloodWaitError
from telethon.tl.custom import Message

from ingest.client import TelegramIngestClient
from ingest.config import Settings, settings
from ingest.db import Channel, Database
from ingest.flood_wait import execute_with_flood_wait
from ingest.logging_utils import get_logger
from ingest.storage import StorageClient, generate_media_key, get_storage_client

logger = get_logger("ingest.backfill")


def parse_since_argument(since_str: Optional[str]) -> Optional[datetime]:
    """
    Parses a --since argument into a timezone-aware UTC datetime.
    Supports:
      - Relative days: "7d", "30d", "1d"
      - Relative hours: "12h", "24h"
      - ISO dates: "2026-08-01", "2026-08-01T00:00:00Z"
    """
    if not since_str:
        return None

    s = since_str.strip().lower()
    now = datetime.now(timezone.utc)

    if s.endswith("d") and s[:-1].isdigit():
        days = int(s[:-1])
        return now - timedelta(days=days)
    if s.endswith("h") and s[:-1].isdigit():
        hours = int(s[:-1])
        return now - timedelta(hours=hours)

    try:
        dt = datetime.fromisoformat(since_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        logger.error(f"Invalid --since format: {since_str}. Expected '7d', '24h', or 'YYYY-MM-DD'")
        raise


class BackfillService:
    """
    Backfills historical messages from allowlisted Telegram channels.
    Resumable via `channels.last_message_id` with album grouping and raw upserts.
    """

    def __init__(
        self,
        tg_client: Optional[TelegramIngestClient] = None,
        db: Optional[Database] = None,
        storage: Optional[StorageClient] = None,
        cfg: Optional[Settings] = None,
    ) -> None:
        self.config = cfg or settings
        self.tg = tg_client or TelegramIngestClient(self.config)
        self.db = db or Database(self.config.DATABASE_URL)
        self.storage = storage or get_storage_client(self.config)

    async def run(
        self,
        channel_target: Optional[Union[str, int]] = None,
        since: Optional[str] = None,
        limit: Optional[int] = None,
        batch_size: Optional[int] = None,
        force_full: bool = False,
    ) -> None:
        """
        Executes backfill across targeted or all active allowlisted channels.
        """
        await self.db.connect()
        await self.tg.ensure_authorized()

        since_dt = parse_since_argument(since)
        effective_batch_size = batch_size or self.config.DEFAULT_BATCH_SIZE

        # Determine target channels
        if channel_target:
            ch = await self.db.get_channel_by_username_or_tg_id(channel_target)
            if not ch:
                logger.error(f"Channel '{channel_target}' not found in channels table.")
                return
            channels = [ch]
        else:
            channels = await self.db.get_active_channels()

        if not channels:
            logger.warning("No active channels found in allowlist to backfill.")
            return

        logger.info(
            "Starting backfill run",
            extra={
                "channel_count": len(channels),
                "since": since_dt.isoformat() if since_dt else "all_history",
                "limit": limit,
                "force_full": force_full,
            },
        )

        total_captured = 0
        start_time = time.time()

        for ch in channels:
            try:
                count = await self.backfill_channel(
                    channel=ch,
                    since_dt=since_dt,
                    limit=limit,
                    batch_size=effective_batch_size,
                    force_full=force_full,
                )
                total_captured += count
            except Exception as e:
                logger.error(
                    f"Error backfilling channel @{ch.username} (ID: {ch.id})",
                    extra={"channel_id": ch.id, "channel_username": ch.username, "error": str(e)},
                    exc_info=True,
                )

        duration = round(time.time() - start_time, 2)
        logger.info(
            "Backfill completed for all channels",
            extra={"total_messages_captured": total_captured, "duration_seconds": duration},
        )

        # Print summary status table
        await self.print_status_report()

    async def backfill_channel(
        self,
        channel: Channel,
        since_dt: Optional[datetime] = None,
        limit: Optional[int] = None,
        batch_size: int = 100,
        force_full: bool = False,
    ) -> int:
        """
        Backfills a single channel. Resumes from `channel.last_message_id` if available.
        Groups albums seamlessly while iterating history.
        """
        logger.info(
            f"Backfilling channel @{channel.username}",
            extra={
                "channel_id": channel.id,
                "telegram_id": channel.telegram_id,
                "last_message_id": channel.last_message_id,
                "force_full": force_full,
            },
        )

        peer = await self.tg.resolve_peer(channel.telegram_id or channel.username)

        # Determine min_id for resumability
        min_id = 0
        if not force_full and channel.last_message_id:
            min_id = channel.last_message_id
            logger.info(
                f"Resuming backfill for @{channel.username} from message_id > {min_id}",
                extra={"channel_id": channel.id, "min_id": min_id},
            )

        messages_processed = 0
        albums_processed = 0
        max_seen_id = channel.last_message_id or 0

        # Album buffering state during iteration
        current_grouped_id: Optional[int] = None
        current_album_messages: List[Message] = []

        async def _flush_current_album() -> None:
            nonlocal albums_processed, messages_processed, max_seen_id
            if not current_album_messages:
                return
            assert current_grouped_id is not None
            await self._process_album_batch(channel.id, current_grouped_id, current_album_messages)
            albums_processed += 1
            messages_processed += 1
            for m in current_album_messages:
                max_seen_id = max(max_seen_id, m.id)
            current_album_messages.clear()

        # Telethon message iterator with FloodWait handling
        async def _iterate():
            # If min_id is set (resuming forward), we iterate reverse=True from min_id
            # Otherwise we iterate backwards from latest (reverse=False) with optional offset_date
            reverse = bool(min_id > 0)
            kwargs: dict[str, Any] = {
                "limit": limit,
                "min_id": min_id if min_id > 0 else 0,
                "reverse": reverse,
            }
            if since_dt and min_id == 0:
                kwargs["offset_date"] = since_dt

            async for msg in self.tg.client.iter_messages(peer, **kwargs):
                yield msg

        try:
            async for message in _iterate():
                if since_dt and message.date and message.date < since_dt:
                    # Reached before --since boundary
                    break

                # Album message
                if message.grouped_id is not None:
                    if current_grouped_id == message.grouped_id:
                        current_album_messages.append(message)
                    else:
                        # Flush previous album if grouped_id changed
                        await _flush_current_album()
                        current_grouped_id = message.grouped_id
                        current_album_messages.append(message)
                else:
                    # Flush previous album if transitioning to a single message
                    await _flush_current_album()
                    current_grouped_id = None

                    # Process standalone single message
                    await self._process_single_message(channel.id, message)
                    messages_processed += 1
                    max_seen_id = max(max_seen_id, message.id)

                    if messages_processed % 50 == 0:
                        logger.info(
                            f"Backfill progress for @{channel.username}: {messages_processed} messages",
                            extra={"channel_id": channel.id, "processed": messages_processed, "max_id": max_seen_id},
                        )
                        # Persist checkpoint
                        await self.db.update_channel_last_message_id(channel.id, max_seen_id)

            # Flush final lingering album if exists
            await _flush_current_album()

        except FloodWaitError as e:
            logger.warning(
                f"FloodWait on @{channel.username}: sleeping {e.seconds}s",
                extra={"channel_id": channel.id, "flood_wait_seconds": e.seconds},
            )
            await asyncio.sleep(e.seconds + 1)

        # Update last_message_id in channels table
        if max_seen_id > (channel.last_message_id or 0):
            await self.db.update_channel_last_message_id(channel.id, max_seen_id)

        logger.info(
            f"Completed backfill for @{channel.username}",
            extra={
                "channel_id": channel.id,
                "channel_username": channel.username,
                "total_rows_written": messages_processed,
                "albums_grouped": albums_processed,
                "last_message_id": max_seen_id,
            },
        )
        return messages_processed

    async def _process_single_message(self, channel_id: int, message: Message) -> None:
        """Downloads media and upserts a standalone message."""
        media_refs: List[str] = []

        if message.media:
            try:
                media_bytes = await self.tg.download_media_bytes(message)
                if media_bytes:
                    key = generate_media_key(
                        channel_id=channel_id,
                        message_id=message.id,
                        media_index=0,
                        media_bytes=media_bytes,
                        ext="jpg",
                    )
                    await self.storage.upload_bytes(media_bytes, key, "image/jpeg")
                    media_refs.append(key)
            except Exception as e:
                logger.error(
                    "Failed downloading media during backfill",
                    extra={"channel_id": channel_id, "message_id": message.id, "error": str(e)},
                )

        raw_text = message.text or None
        posted_at = message.date or datetime.now(timezone.utc)

        await self.db.upsert_raw_message(
            channel_id=channel_id,
            message_id=message.id,
            grouped_id=None,
            raw_text=raw_text,
            media_refs=media_refs if media_refs else None,
            posted_at=posted_at,
        )

    async def _process_album_batch(
        self, channel_id: int, grouped_id: int, messages: Sequence[Message]
    ) -> None:
        """Groups album messages into a single raw_messages row with all media_refs."""
        if not messages:
            return

        sorted_messages = sorted(messages, key=lambda m: getattr(m, "id", 0))
        primary_msg = sorted_messages[0]
        primary_message_id = primary_msg.id

        # Coalesce caption
        caption: Optional[str] = None
        for msg in sorted_messages:
            if msg.text and msg.text.strip():
                caption = msg.text.strip()
                break

        # Download all media items in the album
        media_refs: List[str] = []
        for idx, msg in enumerate(sorted_messages):
            if msg.media:
                try:
                    media_bytes = await self.tg.download_media_bytes(msg)
                    if media_bytes:
                        key = generate_media_key(
                            channel_id=channel_id,
                            message_id=primary_message_id,
                            media_index=idx,
                            media_bytes=media_bytes,
                            ext="jpg",
                        )
                        await self.storage.upload_bytes(media_bytes, key, "image/jpeg")
                        media_refs.append(key)
                except Exception as e:
                    logger.error(
                        "Failed downloading album media in backfill",
                        extra={"channel_id": channel_id, "grouped_id": grouped_id, "error": str(e)},
                    )

        posted_at = primary_msg.date or datetime.now(timezone.utc)

        await self.db.upsert_raw_message(
            channel_id=channel_id,
            message_id=primary_message_id,
            grouped_id=grouped_id,
            raw_text=caption,
            media_refs=media_refs if media_refs else None,
            posted_at=posted_at,
        )

    async def print_status_report(self) -> None:
        """Fetches and displays current ingestion statistics per channel."""
        stats = await self.db.get_ingest_stats()
        print("\n==================== INGESTION STATUS REPORT ====================")
        print(f"{'ID':<4} | {'USERNAME':<26} | {'ACTIVE':<6} | {'LAST_MSG_ID':<11} | {'RAW_MSGS':<8} | {'LATEST POSTED AT'}")
        print("-" * 85)
        total_raw = 0
        for s in stats:
            count = s.get("raw_message_count", 0)
            total_raw += count
            posted_str = str(s.get("latest_message_posted_at") or "-")
            last_id_str = str(s.get("last_message_id") or "-")
            username_str = f"@{s.get('username')}" if s.get("username") else str(s.get("telegram_id"))
            print(
                f"{s['id']:<4} | {username_str:<26} | {str(s['active']):<6} | {last_id_str:<11} | {count:<8} | {posted_str}"
            )
        print("-" * 85)
        print(f"Total Raw Messages across all channels: {total_raw}\n")
