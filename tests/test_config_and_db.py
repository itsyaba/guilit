"""Unit tests for configuration and database helpers."""

import pytest
from datetime import datetime, timezone
from ingest.backfill import parse_since_argument
from ingest.config import Settings
from ingest.listener import normalize_channel_id


def test_parse_since_argument():
    """Validates parsing of relative and ISO date expressions."""
    # 7 days
    dt_7d = parse_since_argument("7d")
    assert dt_7d is not None
    assert (datetime.now(timezone.utc) - dt_7d).total_seconds() > 6 * 86400

    # 24 hours
    dt_24h = parse_since_argument("24h")
    assert dt_24h is not None
    assert (datetime.now(timezone.utc) - dt_24h).total_seconds() > 23 * 3600

    # Specific ISO date
    dt_iso = parse_since_argument("2026-08-01")
    assert dt_iso is not None
    assert dt_iso.year == 2026
    assert dt_iso.month == 8
    assert dt_iso.day == 1

    # None
    assert parse_since_argument(None) is None


def test_normalize_channel_id():
    """Validates Telegram channel and peer ID normalization."""
    # Already negative -100 id
    assert normalize_channel_id(-1001589304921) == -1001589304921

    # Raw positive integer
    assert normalize_channel_id(123456) == 123456


def test_settings_session_path():
    """Validates custom session path construction."""
    cfg = Settings(
        TELEGRAM_SESSION_DIR="/tmp/guilit_sessions",
        TELEGRAM_SESSION_NAME="burner_01",
    )
    assert str(cfg.session_file_path).endswith("burner_01")
