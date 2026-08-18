"""Unit tests for AlbumDebouncer."""

import asyncio
from typing import Any, List
from unittest.mock import AsyncMock
import pytest

from ingest.debouncer import AlbumDebouncer


class MockMessage:
    def __init__(self, msg_id: int, text: str = "", grouped_id: int = 12345):
        self.id = msg_id
        self.text = text
        self.grouped_id = grouped_id


@pytest.mark.asyncio
async def test_album_debouncer_groups_messages_into_single_callback():
    """Validates that rapid album messages are buffered and flushed in a single callback."""
    flushed_albums: List[dict] = []

    async def flush_cb(channel_id: int, grouped_id: int, messages: List[Any]):
        flushed_albums.append({
            "channel_id": channel_id,
            "grouped_id": grouped_id,
            "messages": messages,
        })

    # Short debounce time for test speed
    debouncer = AlbumDebouncer(flush_callback=flush_cb, debounce_seconds=0.05)

    # Post 4 album messages rapidly
    channel_id = 1
    grouped_id = 99999
    msg1 = MockMessage(101, "Sofa for sale", grouped_id)
    msg2 = MockMessage(102, "", grouped_id)
    msg3 = MockMessage(103, "", grouped_id)
    msg4 = MockMessage(104, "", grouped_id)

    await debouncer.add_message(channel_id, grouped_id, msg1)
    await asyncio.sleep(0.01)
    await debouncer.add_message(channel_id, grouped_id, msg2)
    await asyncio.sleep(0.01)
    await debouncer.add_message(channel_id, grouped_id, msg3)
    await asyncio.sleep(0.01)
    await debouncer.add_message(channel_id, grouped_id, msg4)

    # Before debounce expires, callback should not have fired yet
    assert len(flushed_albums) == 0
    assert debouncer.pending_count == 1

    # Wait for debounce timer (0.05s + buffer)
    await asyncio.sleep(0.08)

    # Exactly 1 callback should fire with all 4 messages
    assert len(flushed_albums) == 1
    assert flushed_albums[0]["channel_id"] == 1
    assert flushed_albums[0]["grouped_id"] == 99999
    assert len(flushed_albums[0]["messages"]) == 4
    assert [m.id for m in flushed_albums[0]["messages"]] == [101, 102, 103, 104]
    assert debouncer.pending_count == 0


@pytest.mark.asyncio
async def test_album_debouncer_flush_all_on_shutdown():
    """Validates that flush_all() immediately flushes pending buffered albums."""
    flushed_albums: List[dict] = []

    async def flush_cb(channel_id: int, grouped_id: int, messages: List[Any]):
        flushed_albums.append({
            "channel_id": channel_id,
            "grouped_id": grouped_id,
            "messages": messages,
        })

    debouncer = AlbumDebouncer(flush_callback=flush_cb, debounce_seconds=10.0)

    # Add message
    await debouncer.add_message(1, 888, MockMessage(501, "TV", 888))
    await debouncer.add_message(1, 888, MockMessage(502, "", 888))

    assert len(flushed_albums) == 0
    assert debouncer.pending_count == 1

    # Force flush
    await debouncer.flush_all()

    assert len(flushed_albums) == 1
    assert len(flushed_albums[0]["messages"]) == 2
    assert debouncer.pending_count == 0
