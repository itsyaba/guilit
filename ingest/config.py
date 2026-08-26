"""Configuration management for the Gulit Ingest service."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal, Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file."""

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = Field(
        default="postgresql://guilit:guilit@localhost:5432/guilit",
        description="PostgreSQL connection string (psycopg compatible)",
    )
    DB_POOL_MIN_SIZE: int = Field(default=2, description="Minimum DB connection pool size")
    DB_POOL_MAX_SIZE: int = Field(default=10, description="Maximum DB connection pool size")

    # Telegram MTProto Credentials
    TELEGRAM_API_ID: Optional[int] = Field(
        default=None,
        description="Telegram API ID obtained from https://my.telegram.org",
    )
    TELEGRAM_API_HASH: Optional[str] = Field(
        default=None,
        description="Telegram API Hash obtained from https://my.telegram.org",
    )
    TELEGRAM_PHONE: Optional[str] = Field(
        default=None,
        description="Burner phone number for auth (e.g. +251911000000)",
    )
    TELEGRAM_SESSION_DIR: str = Field(
        default="./sessions",
        description="Directory for persisting SQLite session files across restarts",
    )
    TELEGRAM_SESSION_NAME: str = Field(
        default="guilit_ingest",
        description="Base name of the .session file",
    )

    # Cloudflare R2 / S3 Storage
    STORAGE_BACKEND: Literal["r2", "s3", "local", "mock"] = Field(
        default="local",
        description="Storage backend for downloaded Telegram media",
    )
    R2_ACCOUNT_ID: Optional[str] = Field(default=None, description="Cloudflare Account ID")
    R2_ACCESS_KEY_ID: Optional[str] = Field(default=None, description="R2 / S3 Access Key ID")
    R2_SECRET_ACCESS_KEY: Optional[str] = Field(default=None, description="R2 / S3 Secret Access Key")
    R2_BUCKET_NAME: str = Field(default="guilit-media", description="R2 / S3 Bucket Name")
    R2_ENDPOINT_URL: Optional[str] = Field(
        default=None,
        description="Override S3 endpoint URL (defaults to https://<account_id>.r2.cloudflarestorage.com)",
    )
    R2_REGION: str = Field(
        default="auto",
        description=(
            'SigV4 signing region. R2 wants the literal "auto"; every other '
            "S3-compatible store needs its real region (e.g. eu-central-1)"
        ),
    )
    R2_PUBLIC_URL: Optional[str] = Field(
        default=None,
        description="Public base URL / CDN URL for stored images",
    )
    LOCAL_STORAGE_DIR: str = Field(
        default="./data/media",
        description="Directory for local storage backend",
    )

    # Ingestion Behavior
    ALBUM_DEBOUNCE_SECONDS: float = Field(
        default=3.0,
        description="Debounce buffer time in seconds for grouping album messages",
    )
    ALLOWLIST_REFRESH_SECONDS: int = Field(
        default=60,
        description="Interval to poll the channels table for active allowlisted channels",
    )
    FLOOD_WAIT_MAX_RETRIES: int = Field(
        default=5,
        description="Maximum attempts to handle Telegram FloodWaitError before bubbling",
    )
    DEFAULT_BATCH_SIZE: int = Field(
        default=100,
        description="Default message batch size for historical backfill",
    )

    # Gemini LLM Extraction & Batching
    GEMINI_API_KEY: Optional[str] = Field(
        default=None,
        description="Google Gemini API key for batch extraction",
    )
    GEMINI_MODEL: str = Field(
        default="gemini-2.0-flash-lite",
        description="Gemini model for extraction (e.g. gemini-2.0-flash-lite or gemini-1.5-flash)",
    )
    GEMINI_API_BASE_URL: str = Field(
        default="https://generativelanguage.googleapis.com/v1beta",
        description="Gemini API base endpoint URL",
    )
    EXTRACTION_BATCH_SIZE: int = Field(
        default=20,
        description="Number of messages bundled per LLM request (acceptance criteria: 20)",
    )
    PROMPT_VERSION: str = Field(
        default="v1",
        description="Prompt version identifier stamped on extractions",
    )
    AUTO_PUBLISH_CONFIDENCE_THRESHOLD: float = Field(
        default=0.80,
        description="Confidence threshold for auto-publishing listings without moderation",
    )

    # Logging
    LOG_LEVEL: str = Field(default="INFO", description="Logging level (DEBUG, INFO, WARN, ERROR)")
    LOG_FORMAT: Literal["json", "pretty"] = Field(
        default="pretty",
        description="Log output format: structured JSON or human-readable pretty format",
    )


    @property
    def session_file_path(self) -> Path:
        """Absolute path to the Telethon .session file."""
        session_dir = Path(self.TELEGRAM_SESSION_DIR).resolve()
        session_dir.mkdir(parents=True, exist_ok=True)
        return session_dir / self.TELEGRAM_SESSION_NAME

    @property
    def r2_effective_endpoint(self) -> Optional[str]:
        """Calculated R2 endpoint URL if account ID is set and endpoint is not overridden."""
        if self.R2_ENDPOINT_URL:
            return self.R2_ENDPOINT_URL
        if self.R2_ACCOUNT_ID:
            return f"https://{self.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
        return None


# Global singleton settings instance
settings = Settings()
