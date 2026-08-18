"""Telegram FloodWaitError handler and async decorator."""

from __future__ import annotations

import asyncio
import functools
from typing import Any, Callable, Coroutine, TypeVar
from telethon.errors import FloodWaitError

from ingest.config import settings
from ingest.logging_utils import get_logger

logger = get_logger("ingest.flood_wait")

T = TypeVar("T")


async def execute_with_flood_wait(
    coro_func: Callable[..., Coroutine[Any, Any, T]],
    *args: Any,
    action_name: str = "telegram_operation",
    max_retries: int = 5,
    sleep_buffer: float = 1.0,
    **kwargs: Any,
) -> T:
    """
    Executes an async Telegram operation with automatic FloodWaitError catching and sleeping.
    Never enters an unthrottled retry loop. Sleeps for the exact seconds requested + buffer.
    """
    attempts = 0
    while True:
        try:
            return await coro_func(*args, **kwargs)
        except FloodWaitError as e:
            attempts += 1
            wait_seconds = int(getattr(e, "seconds", 1))
            total_sleep = wait_seconds + sleep_buffer

            logger.warning(
                "Telegram FloodWaitError encountered. Sleeping before resuming.",
                extra={
                    "event": "flood_wait",
                    "action": action_name,
                    "flood_wait_seconds": wait_seconds,
                    "total_sleep_seconds": total_sleep,
                    "attempt": attempts,
                    "max_retries": max_retries,
                },
            )

            if attempts > max_retries:
                logger.error(
                    "Exceeded maximum flood wait retries",
                    extra={"action": action_name, "attempts": attempts},
                )
                raise

            await asyncio.sleep(total_sleep)


def with_flood_wait(
    action_name: str = "telegram_call",
    max_retries: int = 5,
    sleep_buffer: float = 1.0,
) -> Callable[[Callable[..., Coroutine[Any, Any, T]]], Callable[..., Coroutine[Any, Any, T]]]:
    """Decorator to wrap async functions with FloodWait handling."""

    def decorator(func: Callable[..., Coroutine[Any, Any, T]]) -> Callable[..., Coroutine[Any, Any, T]]:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> T:
            return await execute_with_flood_wait(
                func,
                *args,
                action_name=action_name or func.__name__,
                max_retries=max_retries,
                sleep_buffer=sleep_buffer,
                **kwargs,
            )

        return wrapper

    return decorator
