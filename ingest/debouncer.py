"""Album grouping debouncer for Telegram multi-photo and multi-media posts."""

from __future__ import annotations

import asyncio
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

from ingest.config import settings
from ingest.logging_utils import get_logger

logger = get_logger("ingest.debouncer")

# Callback signature: (channel_id: int, grouped_id: int, messages: List[Any]) -> Awaitable[None]
AlbumFlushCallback = Callable[[int, int, List[Any]], Awaitable[None]]


class AlbumDebouncer:
    """
    Debounces incoming Telegram messages sharing a `grouped_id`.
    Buffers all messages for an album within a time window (default 3.0 seconds)
    and flushes them as a single grouped batch.
    """

    def __init__(
        self,
        flush_callback: AlbumFlushCallback,
        debounce_seconds: Optional[float] = None,
    ) -> None:
        self.flush_callback = flush_callback
        self.debounce_seconds = (
            debounce_seconds
            if debounce_seconds is not None
            else settings.ALBUM_DEBOUNCE_SECONDS
        )
        self._buffer: Dict[Tuple[int, int], List[Any]] = {}
        self._timers: Dict[Tuple[int, int], asyncio.TimerHandle] = {}
        self._lock = asyncio.Lock()
        self._running = True

    async def add_message(self, channel_id: int, grouped_id: int, message: Any) -> None:
        """Adds a message to the album buffer and resets the 3-second debounce timer."""
        key = (channel_id, grouped_id)
        async with self._lock:
            if key not in self._buffer:
                self._buffer[key] = []
                logger.debug(
                    "Started new album buffer",
                    extra={"channel_id": channel_id, "grouped_id": grouped_id, "message_id": getattr(message, "id", None)},
                )

            self._buffer[key].append(message)

            # Cancel existing timer if running
            if key in self._timers:
                self._timers[key].cancel()

            # Schedule new debounce timer on the current running loop
            loop = asyncio.get_running_loop()
            self._timers[key] = loop.call_later(
                self.debounce_seconds,
                lambda k=key: asyncio.create_task(self._on_timer_fired(k)),
            )

    async def _on_timer_fired(self, key: Tuple[int, int]) -> None:
        """Internal callback executed when the debounce timer expires."""
        channel_id, grouped_id = key
        messages: List[Any] = []

        async with self._lock:
            self._timers.pop(key, None)
            if key in self._buffer:
                messages = self._buffer.pop(key)

        if messages:
            logger.info(
                "Flushing debounced album",
                extra={
                    "event": "album_debounced",
                    "channel_id": channel_id,
                    "grouped_id": grouped_id,
                    "message_count": len(messages),
                    "message_ids": [getattr(m, "id", None) for m in messages],
                },
            )
            try:
                await self.flush_callback(channel_id, grouped_id, messages)
            except Exception as e:
                logger.error(
                    "Error executing album flush callback",
                    extra={"channel_id": channel_id, "grouped_id": grouped_id, "error": str(e)},
                    exc_info=True,
                )

    async def flush_all(self) -> None:
        """Flushes all currently buffered albums immediately (used on shutdown)."""
        async with self._lock:
            # Cancel all pending timer handles
            for handle in self._timers.values():
                handle.cancel()
            self._timers.clear()

            items = list(self._buffer.items())
            self._buffer.clear()

        for (channel_id, grouped_id), messages in items:
            if messages:
                logger.info(
                    "Force flushing pending album on shutdown",
                    extra={"channel_id": channel_id, "grouped_id": grouped_id, "message_count": len(messages)},
                )
                try:
                    await self.flush_callback(channel_id, grouped_id, messages)
                except Exception as e:
                    logger.error(
                        "Error force flushing album",
                        extra={"channel_id": channel_id, "grouped_id": grouped_id, "error": str(e)},
                        exc_info=True,
                    )

    @property
    def pending_count(self) -> int:
        """Returns the number of albums currently buffering."""
        return len(self._buffer)
