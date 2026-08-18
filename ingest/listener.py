"""Live Telegram MTProto event listener with album debouncing and raw capture."""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Sequence, Union

from telethon import events
from telethon.tl.custom import Message
from telethon.tl.types import PeerChannel, PeerChat

from ingest.client import TelegramIngestClient
from ingest.config import Settings, settings
from ingest.db import Channel, Database
from ingest.debouncer import AlbumDebouncer
from ingest.logging_utils import get_logger
from ingest.storage import StorageClient, generate_media_key, get_storage_client

logger = get_logger("ingest.listener")


def normalize_channel_id(peer_id: Union[int, PeerChannel, PeerChat, Any]) -> int:
    """
    Normalizes Telegram peer IDs to a standard integer format.
    Handles -100... channel prefixes and Telethon PeerChannel instances.
    """
    if hasattr(peer_id, "channel_id"):
        return -1000000000000 - peer_id.channel_id
    if hasattr(peer_id, "chat_id"):
        return -peer_id.chat_id
    if isinstance(peer_id, int):
        return peer_id
    return int(peer_id)


class LiveListener:
    """
    Main live ingestion daemon. Listens to allowlisted Telegram channels,
    debounces multi-part albums, uploads media immediately, and writes raw messages.
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
        self.debouncer = AlbumDebouncer(
            flush_callback=self._handle_flushed_album,
            debounce_seconds=self.config.ALBUM_DEBOUNCE_SECONDS,
        )
        self._channel_map: Dict[int, Channel] = {}
        self._username_map: Dict[str, Channel] = {}
        self._polling_task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self) -> None:
        """Starts the listener service, loads allowlist, and registers event handlers."""
        logger.info("Starting Gulit Live Telegram Ingestion Service")

        await self.db.connect()
        await self.tg.ensure_authorized()

        # Initial allowlist load
        await self.refresh_allowlist()

        # Start periodic allowlist refresh background task
        self._running = True
        self._polling_task = asyncio.create_task(self._poll_allowlist_loop())

        # Register Telethon NewMessage event handler
        self.tg.client.add_event_handler(
            self._on_new_message,
            events.NewMessage(),
        )

        logger.info(
            "Live ingestion listener is running",
            extra={"monitored_channels": len(self._channel_map), "channels": list(self._username_map.keys())},
        )

    async def refresh_allowlist(self) -> None:
        """Refreshes the active channel allowlist from PostgreSQL."""
        channels = await self.db.get_active_channels()
        new_channel_map: Dict[int, Channel] = {}
        new_username_map: Dict[str, Channel] = {}

        for ch in channels:
            # Map both raw telegram_id and positive/negative variants
            norm_id = normalize_channel_id(ch.telegram_id)
            new_channel_map[norm_id] = ch
            new_channel_map[ch.telegram_id] = ch
            # Also map positive channel ID (without -100 prefix if applicable)
            str_id = str(abs(ch.telegram_id))
            if str_id.startswith("100") and len(str_id) > 10:
                short_id = int(str_id[3:])
                new_channel_map[short_id] = ch
                new_channel_map[-short_id] = ch

            if ch.username:
                new_username_map[ch.username.lower().lstrip("@")] = ch

        self._channel_map = new_channel_map
        self._username_map = new_username_map
        logger.info(
            "Channel allowlist refreshed from database",
            extra={"active_channels_count": len(channels)},
        )

    async def _poll_allowlist_loop(self) -> None:
        """Periodic task that checks for newly enabled/disabled channels."""
        while self._running:
            try:
                await asyncio.sleep(self.config.ALLOWLIST_REFRESH_SECONDS)
                await self.refresh_allowlist()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Error refreshing channel allowlist in background", extra={"error": str(e)}, exc_info=True)

    def _find_channel_for_message(self, message: Message) -> Optional[Channel]:
        """Finds matching allowlisted Channel from Telethon message."""
        chat_id = message.chat_id
        if chat_id is not None:
            norm_id = normalize_channel_id(chat_id)
            if norm_id in self._channel_map:
                return self._channel_map[norm_id]
            if chat_id in self._channel_map:
                return self._channel_map[chat_id]

        if hasattr(message, "chat") and message.chat and hasattr(message.chat, "username") and message.chat.username:
            clean_username = message.chat.username.lower().lstrip("@")
            if clean_username in self._username_map:
                return self._username_map[clean_username]

        return None

    async def _on_new_message(self, event: events.NewMessage.Event) -> None:
        """Telethon NewMessage event handler."""
        message: Message = event.message
        if not message:
            return

        channel = self._find_channel_for_message(message)
        if not channel:
            # Message is from an unmonitored chat/channel
            return

        received_at = time.time()

        # Case 1: Album post (shares a grouped_id)
        if message.grouped_id is not None:
            logger.debug(
                "Received album message part",
                extra={"channel_id": channel.id, "grouped_id": message.grouped_id, "message_id": message.id},
            )
            await self.debouncer.add_message(channel.id, message.grouped_id, message)
            return

        # Case 2: Single post
        await self._process_single_message(channel, message, received_at)

    async def _process_single_message(
        self, channel: Channel, message: Message, received_at: float
    ) -> None:
        """Processes a standalone message immediately."""
        media_refs: List[str] = []

        if message.media:
            try:
                media_bytes = await self.tg.download_media_bytes(message)
                if media_bytes:
                    key = generate_media_key(
                        channel_id=channel.id,
                        message_id=message.id,
                        media_index=0,
                        media_bytes=media_bytes,
                        ext="jpg",
                    )
                    await self.storage.upload_bytes(media_bytes, key, "image/jpeg")
                    media_refs.append(key)
            except Exception as e:
                logger.error(
                    "Failed to download or upload media for live message",
                    extra={"channel_id": channel.id, "message_id": message.id, "error": str(e)},
                    exc_info=True,
                )

        raw_text = message.text or None
        posted_at = message.date or datetime.now(timezone.utc)

        raw_id = await self.db.upsert_raw_message(
            channel_id=channel.id,
            message_id=message.id,
            grouped_id=None,
            raw_text=raw_text,
            media_refs=media_refs if media_refs else None,
            posted_at=posted_at,
        )

        await self.db.update_channel_last_message_id(channel.id, message.id)

        latency_ms = int((time.time() - received_at) * 1000)
        logger.info(
            "Captured raw live message",
            extra={
                "event": "live_message_captured",
                "raw_id": raw_id,
                "channel_id": channel.id,
                "channel_username": channel.username,
                "message_id": message.id,
                "media_count": len(media_refs),
                "has_text": bool(raw_text),
                "latency_ms": latency_ms,
            },
        )

    async def _handle_flushed_album(
        self, channel_id: int, grouped_id: int, messages: Sequence[Message]
    ) -> None:
        """
        Callback executed after the 3-second debounce window closes for an album.
        Merges multi-photo album messages into a single raw_messages row with all media_refs.
        """
        if not messages:
            return

        # Sort messages by message_id ascending
        sorted_messages = sorted(messages, key=lambda m: getattr(m, "id", 0))
        primary_msg = sorted_messages[0]
        primary_message_id = primary_msg.id

        # Coalesce captions (Telegram attaches caption to one of the album items)
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
                        "Failed downloading album media part",
                        extra={
                            "channel_id": channel_id,
                            "grouped_id": grouped_id,
                            "part_msg_id": msg.id,
                            "error": str(e),
                        },
                        exc_info=True,
                    )

        posted_at = primary_msg.date or datetime.now(timezone.utc)
        max_message_id = max(m.id for m in sorted_messages)

        raw_id = await self.db.upsert_raw_message(
            channel_id=channel_id,
            message_id=primary_message_id,
            grouped_id=grouped_id,
            raw_text=caption,
            media_refs=media_refs if media_refs else None,
            posted_at=posted_at,
        )

        await self.db.update_channel_last_message_id(channel_id, max_message_id)

        logger.info(
            "Captured raw live album",
            extra={
                "event": "live_album_captured",
                "raw_id": raw_id,
                "channel_id": channel_id,
                "grouped_id": grouped_id,
                "primary_message_id": primary_message_id,
                "total_parts": len(sorted_messages),
                "media_count": len(media_refs),
                "has_caption": bool(caption),
            },
        )

    async def stop(self) -> None:
        """Gracefully shuts down the listener."""
        logger.info("Stopping Live Telegram Ingestion Service...")
        self._running = False
        if self._polling_task:
            self._polling_task.cancel()

        # Flush any remaining albums in the debounce buffer
        await self.debouncer.flush_all()

        await self.tg.disconnect()
        await self.db.close()
        logger.info("Live Telegram Ingestion Service stopped cleanly.")
