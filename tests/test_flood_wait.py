"""Unit tests for FloodWaitError handling."""

import asyncio
from unittest.mock import AsyncMock, patch
import pytest
from telethon.errors import FloodWaitError

from ingest.flood_wait import execute_with_flood_wait, with_flood_wait


@pytest.mark.asyncio
async def test_flood_wait_handler_sleeps_and_resumes():
    """Validates that FloodWaitError is caught, sleeps the returned duration, and resumes."""
    attempts = 0

    async def mock_tg_call():
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            # Raise FloodWaitError with seconds = 2
            err = FloodWaitError(request=None)
            err.seconds = 2
            raise err
        return "success_result"

    with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        result = await execute_with_flood_wait(
            mock_tg_call,
            action_name="test_call",
            sleep_buffer=1.0,
        )

        assert result == "success_result"
        assert attempts == 2
        # Assert asyncio.sleep was called with 2 + 1.0 = 3.0s
        mock_sleep.assert_called_once_with(3.0)


@pytest.mark.asyncio
async def test_with_flood_wait_decorator():
    """Validates the @with_flood_wait decorator syntax."""
    call_count = 0

    @with_flood_wait(action_name="decorated_call", sleep_buffer=0.5)
    async def decorated_action(val: int) -> int:
        nonlocal call_count
        call_count += 1
        if call_count < 2:
            err = FloodWaitError(request=None)
            err.seconds = 1
            raise err
        return val * 2

    with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        res = await decorated_action(21)
        assert res == 42
        assert call_count == 2
        mock_sleep.assert_called_once_with(1.5)
