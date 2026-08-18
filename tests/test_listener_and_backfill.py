"""Integration and acceptance tests for LiveListener and BackfillService."""

import asyncio
from datetime import datetime, timezone
from typing import Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock
import pytest

from ingest.backfill import BackfillService
from ingest.db import Channel, Database
from ingest.listener import LiveListener
from ingest.storage import MockStorageClient


class MockDB:
    """In-memory mock database reproducing the postgres tables and constraints."""

    def __init__(self):
        self.channels: Dict[int, Channel] = {
            1: Channel(
                id=1,
                telegram_id=-1001589304921,
                username="addis_used_market",
                title="Addis Used Market",
                active=True,
                last_message_id=4800,
            ),
            2: Channel(
                id=2,
                telegram_id=-1001894720184,
                username="ethio_brand_phones",
                title="Ethio Brand Phones",
                active=False,  # Inactive
                last_message_id=3120,
            ),
        }
        # (channel_id, message_id) -> row dict
        self.raw_messages: Dict[tuple, dict] = {}
        self._next_id = 1

    async def connect(self):
        pass

    async def close(self):
        pass

    async def get_active_channels(self) -> List[Channel]:
        return [c for c in self.channels.values() if c.active]

    async def get_channel_by_id(self, channel_id: int) -> Optional[Channel]:
        return self.channels.get(channel_id)

    async def get_channel_by_username_or_tg_id(self, identifier) -> Optional[Channel]:
        for ch in self.channels.values():
            if str(ch.telegram_id) == str(identifier) or ch.username.lower() == str(identifier).lstrip("@").lower():
                return ch
        return None

    async def upsert_raw_message(
        self,
        channel_id: int,
        message_id: int,
        grouped_id: Optional[int],
        raw_text: Optional[str],
        media_refs: Optional[List[str]],
        posted_at: datetime,
    ) -> int:
        key = (channel_id, message_id)
        if key in self.raw_messages:
            row = self.raw_messages[key]
            if grouped_id is not None:
                row["grouped_id"] = grouped_id
            if raw_text is not None:
                row["raw_text"] = raw_text
            if media_refs is not None and len(media_refs) > 0:
                row["media_refs"] = media_refs
            row["posted_at"] = posted_at
            return row["id"]

        row_id = self._next_id
        self._next_id += 1
        self.raw_messages[key] = {
            "id": row_id,
            "channel_id": channel_id,
            "message_id": message_id,
            "grouped_id": grouped_id,
            "raw_text": raw_text,
            "media_refs": list(media_refs) if media_refs else [],
            "posted_at": posted_at,
        }
        return row_id

    async def update_channel_last_message_id(self, channel_id: int, last_message_id: int):
        ch = self.channels.get(channel_id)
        if ch:
            current = ch.last_message_id or 0
            ch.last_message_id = max(current, last_message_id)

    async def get_ingest_stats(self):
        stats = []
        for ch in self.channels.values():
            count = sum(1 for (cid, _) in self.raw_messages.keys() if cid == ch.id)
            stats.append({
                "id": ch.id,
                "telegram_id": ch.telegram_id,
                "username": ch.username,
                "title": ch.title,
                "active": ch.active,
                "last_message_id": ch.last_message_id,
                "raw_message_count": count,
                "latest_message_posted_at": None,
            })
        return stats


class MockTgMessage:
    def __init__(
        self,
        msg_id: int,
        text: str = "",
        grouped_id: Optional[int] = None,
        has_media: bool = True,
        date: Optional[datetime] = None,
        chat_id: int = -1001589304921,
    ):
        self.id = msg_id
        self.text = text
        self.grouped_id = grouped_id
        self.media = MagicMock() if has_media else None
        self.date = date or datetime.now(timezone.utc)
        self.chat_id = chat_id
        self.chat = MagicMock(username="addis_used_market")


class MockTelegramClient:
    def __init__(self):
        self.messages_to_yield: List[MockTgMessage] = []
        self._download_counter = 0

    async def ensure_authorized(self):
        pass

    async def disconnect(self):
        pass

    async def resolve_peer(self, identifier):
        return MagicMock(id=-1001589304921)

    async def download_media_bytes(self, message: MockTgMessage) -> Optional[bytes]:
        if not message.media:
            return None
        self._download_counter += 1
        return f"photo_bytes_{message.id}_{self._download_counter}".encode("utf-8")

    @property
    def client(self):
        mock_cli = MagicMock()

        async def _iter_messages(peer, limit=None, min_id=0, reverse=False, **kwargs):
            msgs = list(self.messages_to_yield)
            if min_id > 0:
                msgs = [m for m in msgs if m.id > min_id]
            if reverse:
                msgs = sorted(msgs, key=lambda m: m.id)
            else:
                msgs = sorted(msgs, key=lambda m: m.id, reverse=True)
            if limit:
                msgs = msgs[:limit]
            for m in msgs:
                yield m

        mock_cli.iter_messages = _iter_messages
        mock_cli.add_event_handler = MagicMock()
        return mock_cli


@pytest.mark.asyncio
async def test_live_album_post_produces_single_row_with_four_media_refs():
    """
    Acceptance Criteria Test:
    Post a 4-photo album to a test channel -> one row with 4 media refs.
    """
    mock_db = MockDB()
    mock_storage = MockStorageClient()
    mock_tg = MockTelegramClient()

    listener = LiveListener(
        tg_client=mock_tg,
        db=mock_db,
        storage=mock_storage,
    )
    # Set fast debounce for testing
    listener.debouncer.debounce_seconds = 0.05
    await listener.refresh_allowlist()

    # Create 4 album messages sharing grouped_id=77777
    grouped_id = 77777
    messages = [
        MockTgMessage(4824, "L-shaped Leather Sofa - 45,000 ETB", grouped_id=grouped_id, has_media=True),
        MockTgMessage(4825, "", grouped_id=grouped_id, has_media=True),
        MockTgMessage(4826, "", grouped_id=grouped_id, has_media=True),
        MockTgMessage(4827, "", grouped_id=grouped_id, has_media=True),
    ]

    # Simulate live arrival of the 4 album messages
    for msg in messages:
        event = MagicMock()
        event.message = msg
        await listener._on_new_message(event)

    # Wait for the debounce timer to flush
    await asyncio.sleep(0.08)

    # Verify: Exactly 1 row in raw_messages
    assert len(mock_db.raw_messages) == 1

    # Key is (channel_id=1, primary_message_id=4824)
    raw_row = mock_db.raw_messages[(1, 4824)]
    assert raw_row["channel_id"] == 1
    assert raw_row["message_id"] == 4824
    assert raw_row["grouped_id"] == 77777
    assert raw_row["raw_text"] == "L-shaped Leather Sofa - 45,000 ETB"
    assert len(raw_row["media_refs"]) == 4

    # Verify all 4 images were uploaded into storage
    for ref in raw_row["media_refs"]:
        assert await mock_storage.exists(ref)

    # Verify channel last_message_id was updated to 4827
    channel = await mock_db.get_channel_by_id(1)
    assert channel.last_message_id == 4827


@pytest.mark.asyncio
async def test_resumable_backfill_produces_zero_duplicate_rows():
    """
    Acceptance Criteria Test:
    Re-running backfill produces zero duplicate rows and resumes from last_message_id.
    """
    mock_db = MockDB()
    mock_storage = MockStorageClient()
    mock_tg = MockTelegramClient()

    # Populate 10 mock messages in channel history (IDs 4801 to 4810)
    # Including an album with 3 photos (4805, 4806, 4807)
    msgs = []
    for mid in range(4801, 4805):
        msgs.append(MockTgMessage(mid, f"Phone #{mid}", grouped_id=None, has_media=True))
    # 3-photo album
    for mid in range(4805, 4808):
        msgs.append(MockTgMessage(mid, "Dining Table" if mid == 4805 else "", grouped_id=5555, has_media=True))
    for mid in range(4808, 4811):
        msgs.append(MockTgMessage(mid, f"Car part #{mid}", grouped_id=None, has_media=False))

    mock_tg.messages_to_yield = msgs

    service = BackfillService(
        tg_client=mock_tg,
        db=mock_db,
        storage=mock_storage,
    )

    # First backfill run
    await service.run(channel_target="addis_used_market")

    # We expect 4 single msgs (4801..4804) + 1 album (4805) + 3 single msgs (4808..4810) = 8 rows
    initial_row_count = len(mock_db.raw_messages)
    assert initial_row_count == 8

    # Channel last_message_id updated to 4810
    channel = await mock_db.get_channel_by_id(1)
    assert channel.last_message_id == 4810

    # Second backfill run (Re-running backfill)
    await service.run(channel_target="addis_used_market")

    # Re-running must produce ZERO duplicate rows
    assert len(mock_db.raw_messages) == initial_row_count

    # Force full re-run must still produce ZERO duplicate rows due to ON CONFLICT idempotency
    await service.run(channel_target="addis_used_market", force_full=True)
    assert len(mock_db.raw_messages) == initial_row_count
