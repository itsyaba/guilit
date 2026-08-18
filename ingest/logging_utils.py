"""Structured logging for the Gulit Ingestion service."""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any, Dict


class JsonFormatter(logging.Formatter):
    """Formats log records as JSON lines with contextual metadata."""

    def format(self, record: logging.LogRecord) -> str:
        log_data: Dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Include custom extra attributes
        for key, value in record.__dict__.items():
            if key not in (
                "args",
                "asctime",
                "created",
                "exc_info",
                "exc_text",
                "filename",
                "funcName",
                "levelname",
                "levelno",
                "lineno",
                "module",
                "msecs",
                "msg",
                "name",
                "pathname",
                "process",
                "processName",
                "relativeCreated",
                "stack_info",
                "thread",
                "threadName",
            ):
                log_data[key] = value

        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data, default=str)


class PrettyFormatter(logging.Formatter):
    """Human-friendly colorized console formatter for local development."""

    LEVEL_COLORS = {
        "DEBUG": "\033[36m",    # Cyan
        "INFO": "\033[32m",     # Green
        "WARNING": "\033[33m",  # Yellow
        "ERROR": "\033[31m",    # Red
        "CRITICAL": "\033[35m", # Magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.LEVEL_COLORS.get(record.levelname, self.RESET)
        time_str = datetime.fromtimestamp(record.created).strftime("%H:%M:%S")
        base_msg = f"{color}[{time_str}] [{record.levelname:<5}] [{record.name}]{self.RESET} {record.getMessage()}"

        # Collect extra context
        extras = {}
        for key, value in record.__dict__.items():
            if key not in (
                "args",
                "asctime",
                "created",
                "exc_info",
                "exc_text",
                "filename",
                "funcName",
                "levelname",
                "levelno",
                "lineno",
                "module",
                "msecs",
                "msg",
                "name",
                "pathname",
                "process",
                "processName",
                "relativeCreated",
                "stack_info",
                "thread",
                "threadName",
            ):
                extras[key] = value

        if extras:
            extra_str = " ".join(f"\033[90m{k}=\033[0m{v}" for k, v in extras.items())
            base_msg = f"{base_msg} | {extra_str}"

        if record.exc_info:
            base_msg = f"{base_msg}\n{self.formatException(record.exc_info)}"

        return base_msg


def setup_logging(level: str = "INFO", log_format: str = "pretty") -> None:
    """Configures global logging handlers and formatting."""
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Remove existing handlers to avoid duplicates
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    console_handler = logging.StreamHandler(sys.stdout)
    if log_format.lower() == "json":
        console_handler.setFormatter(JsonFormatter())
    else:
        console_handler.setFormatter(PrettyFormatter())

    root_logger.addHandler(console_handler)

    # Silence overly verbose external loggers
    logging.getLogger("telethon").setLevel(logging.WARNING)
    logging.getLogger("psycopg").setLevel(logging.ERROR)
    logging.getLogger("psycopg.pool").setLevel(logging.ERROR)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("botocore").setLevel(logging.WARNING)
    logging.getLogger("boto3").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)



def get_logger(name: str) -> logging.Logger:
    """Returns a logger instance with the given name."""
    return logging.getLogger(name)
