"""Unit tests for media storage backends and key generation."""

import pytest
from pathlib import Path
import tempfile

from ingest.storage import (
    LocalStorageClient,
    MockStorageClient,
    generate_media_key,
)


@pytest.mark.asyncio
async def test_generate_media_key_format():
    """Validates structured R2/storage key generation."""
    sample_bytes = b"fake_jpeg_image_data_here"
    key = generate_media_key(
        channel_id=1,
        message_id=4823,
        media_index=0,
        media_bytes=sample_bytes,
        ext="jpg",
    )
    assert key.startswith("raw/1/4823_0_")
    assert key.endswith(".jpg")


@pytest.mark.asyncio
async def test_mock_storage_client():
    """Validates in-memory mock storage client."""
    storage = MockStorageClient()
    data = b"image_binary_data"
    key = "raw/1/100_0.jpg"

    assert not await storage.exists(key)
    saved_key = await storage.upload_bytes(data, key, "image/jpeg")
    assert saved_key == key
    assert await storage.exists(key)
    retrieved = await storage.get_bytes(key)
    assert retrieved == data


@pytest.mark.asyncio
async def test_local_storage_client():
    """Validates local filesystem storage client."""
    with tempfile.TemporaryDirectory() as tmpdir:
        storage = LocalStorageClient(base_dir=tmpdir)
        data = b"local_file_bytes"
        key = "raw/2/200_0_abcd1234.jpg"

        assert not await storage.exists(key)
        saved_key = await storage.upload_bytes(data, key, "image/jpeg")
        assert saved_key == key
        assert await storage.exists(key)
        assert await storage.get_bytes(key) == data
