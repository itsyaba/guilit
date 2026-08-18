"""Storage client for downloading and persisting Telegram media to Cloudflare R2 or local storage."""

from __future__ import annotations

import asyncio
import hashlib
import mimetypes
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, Optional

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from ingest.config import Settings, settings
from ingest.logging_utils import get_logger

logger = get_logger("ingest.storage")


class StorageClient(ABC):
    """Abstract interface for media storage backends."""

    @abstractmethod
    async def upload_bytes(
        self, data: bytes, key: str, content_type: Optional[str] = None
    ) -> str:
        """Upload raw bytes to storage, returning the stored key."""
        pass

    @abstractmethod
    async def get_bytes(self, key: str) -> bytes:
        """Retrieve bytes from storage by key."""
        pass

    @abstractmethod
    async def exists(self, key: str) -> bool:
        """Check if an object exists in storage."""
        pass


class R2StorageClient(StorageClient):
    """Cloudflare R2 / S3-compatible object storage client."""

    def __init__(
        self,
        account_id: Optional[str] = None,
        access_key_id: Optional[str] = None,
        secret_access_key: Optional[str] = None,
        bucket_name: Optional[str] = None,
        endpoint_url: Optional[str] = None,
    ) -> None:
        self.bucket_name = bucket_name or settings.R2_BUCKET_NAME
        self.endpoint_url = (
            endpoint_url
            or (f"https://{account_id}.r2.cloudflarestorage.com" if account_id else None)
            or settings.r2_effective_endpoint
        )
        self.access_key_id = access_key_id or settings.R2_ACCESS_KEY_ID
        self.secret_access_key = secret_access_key or settings.R2_SECRET_ACCESS_KEY

        assert self.endpoint_url, "R2 endpoint URL or Account ID must be provided"
        assert self.access_key_id, "R2 Access Key ID must be provided"
        assert self.secret_access_key, "R2 Secret Access Key must be provided"

        self._s3 = boto3.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.access_key_id,
            aws_secret_access_key=self.secret_access_key,
            config=Config(
                signature_version="s3v4",
                retries={"max_attempts": 3, "mode": "standard"},
            ),
            region_name="auto",
        )

    def _sync_upload(self, data: bytes, key: str, content_type: str) -> None:
        self._s3.put_object(
            Bucket=self.bucket_name,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    def _sync_get(self, key: str) -> bytes:
        response = self._s3.get_object(Bucket=self.bucket_name, Key=key)
        return response["Body"].read()

    def _sync_exists(self, key: str) -> bool:
        try:
            self._s3.head_object(Bucket=self.bucket_name, Key=key)
            return True
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") == "404":
                return False
            raise

    async def upload_bytes(
        self, data: bytes, key: str, content_type: Optional[str] = None
    ) -> str:
        if not content_type:
            content_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
        await asyncio.to_thread(self._sync_upload, data, key, content_type)
        logger.debug("Uploaded media to R2", extra={"key": key, "bytes": len(data)})
        return key

    async def get_bytes(self, key: str) -> bytes:
        return await asyncio.to_thread(self._sync_get, key)

    async def exists(self, key: str) -> bool:
        return await asyncio.to_thread(self._sync_exists, key)


class LocalStorageClient(StorageClient):
    """Local filesystem storage backend for development and offline testing."""

    def __init__(self, base_dir: Optional[str | Path] = None) -> None:
        self.base_dir = Path(base_dir or settings.LOCAL_STORAGE_DIR).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _get_path(self, key: str) -> Path:
        # Sanitize key to prevent path traversal
        clean_key = key.lstrip("/")
        return self.base_dir / clean_key

    async def upload_bytes(
        self, data: bytes, key: str, content_type: Optional[str] = None
    ) -> str:
        target_path = self._get_path(key)
        target_path.parent.mkdir(parents=True, exist_ok=True)

        def _write() -> None:
            target_path.write_bytes(data)

        await asyncio.to_thread(_write)
        logger.debug("Saved media to local storage", extra={"key": key, "path": str(target_path), "bytes": len(data)})
        return key

    async def get_bytes(self, key: str) -> bytes:
        target_path = self._get_path(key)
        if not target_path.exists():
            raise FileNotFoundError(f"Key not found in local storage: {key}")
        return await asyncio.to_thread(target_path.read_bytes)

    async def exists(self, key: str) -> bool:
        target_path = self._get_path(key)
        return await asyncio.to_thread(target_path.exists)


class MockStorageClient(StorageClient):
    """In-memory mock storage client for unit testing."""

    def __init__(self) -> None:
        self.storage: Dict[str, bytes] = {}

    async def upload_bytes(
        self, data: bytes, key: str, content_type: Optional[str] = None
    ) -> str:
        self.storage[key] = data
        return key

    async def get_bytes(self, key: str) -> bytes:
        if key not in self.storage:
            raise FileNotFoundError(f"Key not found in mock storage: {key}")
        return self.storage[key]

    async def exists(self, key: str) -> bool:
        return key in self.storage


def generate_media_key(
    channel_id: int,
    message_id: int,
    media_index: int = 0,
    media_bytes: Optional[bytes] = None,
    ext: str = "jpg",
) -> str:
    """
    Generates a deterministic, structured R2 key:
    Format: raw/{channel_id}/{message_id}_{index}_{hash8}.{ext}
    """
    clean_ext = ext.lstrip(".").lower() or "jpg"
    if media_bytes:
        digest = hashlib.sha256(media_bytes).hexdigest()[:8]
        return f"raw/{channel_id}/{message_id}_{media_index}_{digest}.{clean_ext}"
    return f"raw/{channel_id}/{message_id}_{media_index}.{clean_ext}"


def get_storage_client(cfg: Optional[Settings] = None) -> StorageClient:
    """Factory to instantiate the appropriate storage backend based on configuration."""
    conf = cfg or settings
    backend = conf.STORAGE_BACKEND.lower()

    if backend == "mock":
        return MockStorageClient()

    if backend == "r2" or (
        backend == "s3"
        and conf.R2_ACCESS_KEY_ID
        and conf.R2_SECRET_ACCESS_KEY
        and conf.r2_effective_endpoint
    ):
        try:
            return R2StorageClient(
                account_id=conf.R2_ACCOUNT_ID,
                access_key_id=conf.R2_ACCESS_KEY_ID,
                secret_access_key=conf.R2_SECRET_ACCESS_KEY,
                bucket_name=conf.R2_BUCKET_NAME,
                endpoint_url=conf.R2_ENDPOINT_URL,
            )
        except Exception as e:
            logger.warning(
                f"Failed to initialize R2 client: {e}. Falling back to LocalStorageClient",
                extra={"error": str(e)},
            )
            return LocalStorageClient(conf.LOCAL_STORAGE_DIR)

    return LocalStorageClient(conf.LOCAL_STORAGE_DIR)
