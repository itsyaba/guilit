"""Telethon client wrapper with authentication, session persistence, and media download."""

from __future__ import annotations

import getpass
import io
import os
from pathlib import Path
from typing import Any, AsyncIterator, Dict, Optional, Union

from telethon import TelegramClient, events
from telethon.errors import (
    FloodWaitError,
    PhoneNumberInvalidError,
    SessionPasswordNeededError,
)
from telethon.tl.custom import Message
from telethon.tl.types import (
    Channel as TgChannel,
    Chat as TgChat,
    InputPeerChannel,
    MessageMediaDocument,
    MessageMediaPhoto,
)

from ingest.config import Settings, settings
from ingest.flood_wait import execute_with_flood_wait
from ingest.logging_utils import get_logger

logger = get_logger("ingest.client")


class SessionNotAuthorizedError(Exception):
    """Raised when the Telethon session file is not authorized and requires login."""
    pass


class MissingTelegramCredentialsError(Exception):
    """Raised when TELEGRAM_API_ID or TELEGRAM_API_HASH is missing."""
    pass


class TelegramIngestClient:
    """Manages the Telethon MTProto client lifecycle and session persistence."""

    def __init__(self, cfg: Optional[Settings] = None) -> None:
        self.config = cfg or settings
        self._api_id = self.config.TELEGRAM_API_ID
        self._api_hash = self.config.TELEGRAM_API_HASH
        self._session_path = self.config.session_file_path
        self._client: Optional[TelegramClient] = None
        self._peer_cache: Dict[Union[int, str], Any] = {}

    @property
    def client(self) -> TelegramClient:
        """Returns the underlying Telethon client instance."""
        if self._client is None:
            if not self._api_id or not self._api_hash:
                raise MissingTelegramCredentialsError(
                    "TELEGRAM_API_ID and TELEGRAM_API_HASH must be configured in environment or .env.\n"
                    "1. Obtain credentials from https://my.telegram.org (API Development tools).\n"
                    "2. Add them to .env.local:\n"
                    "     TELEGRAM_API_ID=12345678\n"
                    "     TELEGRAM_API_HASH=your_api_hash_here"
                )
            self._client = TelegramClient(
                str(self._session_path),
                self._api_id,
                self._api_hash,
                auto_reconnect=True,
                connection_retries=10,
                retry_delay=2,
            )
        return self._client


    async def connect(self) -> bool:
        """Connects to MTProto servers without prompting for credentials."""
        await self.client.connect()
        is_auth = await self.client.is_user_authorized()
        logger.info(
            "Telethon client connected",
            extra={
                "session_path": str(self._session_path),
                "is_authorized": is_auth,
            },
        )
        return is_auth

    async def is_authorized(self) -> bool:
        """Checks whether the persistent session is authorized."""
        if not self.client.is_connected():
            await self.client.connect()
        return await self.client.is_user_authorized()

    async def ensure_authorized(self) -> None:
        """Ensures the client is authorized, otherwise raises SessionNotAuthorizedError."""
        if not await self.is_authorized():
            raise SessionNotAuthorizedError(
                f"Telethon session '{self._session_path}' is not authorized. "
                f"Please run 'python -m ingest.cli auth' to authenticate your burner number."
            )
        me = await self.client.get_me()
        phone = getattr(me, "phone", "unknown")
        username = getattr(me, "username", "none")
        logger.info(
            "Authenticated as Telegram user",
            extra={"phone": f"+{phone}" if phone else phone, "username": username, "id": me.id},
        )

    async def interactive_auth(self, phone: Optional[str] = None) -> None:
        """Runs the interactive authentication CLI flow for burner numbers."""
        await self.client.connect()
        if await self.client.is_user_authorized():
            me = await self.client.get_me()
            logger.info(
                "Session is already authorized",
                extra={"user_id": me.id, "phone": getattr(me, "phone", None)},
            )
            print(f"✓ Already authenticated as {me.first_name} (@{me.username or me.id}) [+{me.phone}]")
            return

        target_phone = phone or self.config.TELEGRAM_PHONE
        if not target_phone:
            target_phone = input("Enter burner phone number (international format e.g. +251911223344): ").strip()

        print(f"\nSending login code to {target_phone}...")
        try:
            sent_code = await execute_with_flood_wait(
                self.client.send_code_request,
                target_phone,
                action_name="send_code_request",
            )
        except PhoneNumberInvalidError:
            print(f"❌ Error: The phone number {target_phone} is invalid according to Telegram.")
            raise

        code = input("Enter the login code you received: ").strip()
        try:
            await self.client.sign_in(target_phone, code)
        except SessionPasswordNeededError:
            print("2-Step Verification (2FA) is enabled for this account.")
            password = getpass.getpass("Enter your 2FA password: ")
            await self.client.sign_in(password=password)

        me = await self.client.get_me()
        print(f"\n✓ Successfully authenticated as {me.first_name} (@{me.username or me.id}) [+{me.phone}]")
        print(f"✓ Session saved to: {self._session_path}.session")
        logger.info("Authentication successful", extra={"user_id": me.id, "session_path": str(self._session_path)})

    async def resolve_peer(self, identifier: Union[int, str]) -> Any:
        """Resolves a channel username or ID to a Telethon entity with FloodWait protection."""
        if identifier in self._peer_cache:
            return self._peer_cache[identifier]

        # Handle numeric IDs or usernames
        target: Union[int, str]
        if isinstance(identifier, int):
            target = identifier
        elif isinstance(identifier, str) and identifier.lstrip("-").isdigit():
            target = int(identifier)
        else:
            target = identifier.lstrip("@")

        entity = await execute_with_flood_wait(
            self.client.get_entity,
            target,
            action_name=f"get_entity_{identifier}",
        )
        self._peer_cache[identifier] = entity
        if hasattr(entity, "id"):
            self._peer_cache[entity.id] = entity
        if hasattr(entity, "username") and entity.username:
            self._peer_cache[entity.username] = entity
            self._peer_cache[f"@{entity.username}"] = entity

        return entity

    async def download_media_bytes(self, message: Message) -> Optional[bytes]:
        """
        Downloads media bytes from a Telegram message directly into memory.
        Telethon file references expire; storing raw bytes immediately in R2 is mandatory.
        """
        if not message or not message.media:
            return None

        # Ignore non-photo / non-visual document media like location or contacts
        if not isinstance(message.media, (MessageMediaPhoto, MessageMediaDocument)):
            return None

        buffer = io.BytesIO()

        async def _download() -> Optional[bytes]:
            result = await self.client.download_media(message.media, file=buffer)
            if result is None:
                return None
            return buffer.getvalue()

        return await execute_with_flood_wait(
            _download,
            action_name=f"download_media_msg_{message.id}",
        )

    async def disconnect(self) -> None:
        """Disconnects the client gracefully."""
        if self._client and self._client.is_connected():
            await self._client.disconnect()
            logger.info("Telethon client disconnected")
