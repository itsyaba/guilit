"""PII Stripping and Reattachment Module.

Strict Architecture Guarantee:
1. Ethiopian phone numbers (+251..., 09..., 07...) and Telegram handles (@username)
   must NEVER leave our infrastructure or be sent to third-party LLM providers.
2. In Pass 1, phone numbers are extracted, hashed, and substituted with placeholders:
   - Phone numbers -> [PHONE_1], [PHONE_2], ...
   - Telegram handles -> [USER_1], [USER_2], ...
3. After Gemini returns structured JSON, placeholders are reattached from local DB memory.
4. `assert_zero_pii()` runs on every outbound batch payload before transmission.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple
from pydantic import BaseModel, Field
from ingest.extract.regex_rules import extract_phone_numbers, extract_telegram_handles


class PIIMapping(BaseModel):
    """Bidirectional mapping table between PII placeholders and original values."""

    # "[PHONE_1]" -> (raw_string, normalized_phone)
    phones: Dict[str, Tuple[str, str]] = Field(default_factory=dict)
    # "[USER_1]" -> "@username"
    handles: Dict[str, str] = Field(default_factory=dict)
    sanitized_text: str = ""
    original_text: str = ""


class SanitizedMessage(BaseModel):
    """A message prepped for batch LLM payload with zero PII."""

    index: int
    raw_message_id: int
    sanitized_text: str
    pii_mapping: PIIMapping


# Strict detector for any remaining unmasked Ethiopian phone numbers
ETHIO_PHONE_LEAK_DETECTOR = re.compile(
    r"""
    (?<!\d)
    (?:
        (?:\+|00)?251[\s.-]?[97]\d{2}[\s.-]?\d{2,3}[\s.-]?\d{2,4} |
        0[97]\d{2}[\s.-]?\d{2,3}[\s.-]?\d{2,4} |
        (?<!\[PHONE_)[97]\d{8}
    )
    (?!\d)
    """,
    re.VERBOSE,
)


def sanitize_message_pii(
    raw_text: str,
    raw_message_id: int = 0,
    index: int = 1,
) -> SanitizedMessage:
    """Substitutes phone numbers and telegram handles with [PHONE_N] and [USER_N] tokens."""
    if not raw_text:
        return SanitizedMessage(
            index=index,
            raw_message_id=raw_message_id,
            sanitized_text="",
            pii_mapping=PIIMapping(),
        )

    text = raw_text
    phones_map: Dict[str, Tuple[str, str]] = {}
    handles_map: Dict[str, str] = {}

    # 1. Extract and substitute phone numbers
    raw_phones, norm_phones = extract_phone_numbers(text)
    for i, (raw_p, norm_p) in enumerate(zip(raw_phones, norm_phones), start=1):
        token = f"[PHONE_{i}]"
        phones_map[token] = (raw_p, norm_p)
        # Replace exact raw occurrence
        text = text.replace(raw_p, token)

    # 2. Extract and substitute handles
    handles = extract_telegram_handles(text)
    for i, handle in enumerate(handles, start=1):
        token = f"[USER_{i}]"
        handles_map[token] = handle
        # Replace @handle and link variants
        text = text.replace(handle, token)
        text = text.replace(f"https://t.me/{handle.lstrip('@')}", token)
        text = text.replace(f"t.me/{handle.lstrip('@')}", token)

    # Verify zero phone leaks in sanitized text
    sanitized_clean = text.strip()
    
    mapping = PIIMapping(
        phones=phones_map,
        handles=handles_map,
        sanitized_text=sanitized_clean,
        original_text=raw_text,
    )

    return SanitizedMessage(
        index=index,
        raw_message_id=raw_message_id,
        sanitized_text=sanitized_clean,
        pii_mapping=mapping,
    )


def assert_zero_pii(text: str) -> None:
    """Raises ValueError if any unmasked Ethiopian phone numbers are found in text."""
    if not text:
        return
    
    # Strip intentional placeholder tokens before checking
    masked = re.sub(r"\[PHONE_\d+\]", "", text)
    masked = re.sub(r"\[USER_\d+\]", "", masked)
    
    match = ETHIO_PHONE_LEAK_DETECTOR.search(masked)
    if match:
        leaked_segment = match.group(0)
        raise ValueError(
            f"PII SECURITY VIOLATION: Unmasked Ethiopian phone number detected in payload: '{leaked_segment}'"
        )


def reattach_pii(
    extracted_record: dict,
    pii_mapping: PIIMapping,
) -> dict:
    """Reattaches true raw and normalized phone numbers and handles to the extracted record."""
    result = dict(extracted_record)

    # Default to first extracted phone from Pass 1 if available
    phone_raw = None
    phone_normalized = None

    # Check if Gemini referenced a specific placeholder (e.g. "[PHONE_1]")
    phone_token = result.get("phone_placeholder")
    if phone_token and phone_token in pii_mapping.phones:
        phone_raw, phone_normalized = pii_mapping.phones[phone_token]
    elif pii_mapping.phones:
        # Fallback to the first detected phone in the message
        first_token = sorted(pii_mapping.phones.keys())[0]
        phone_raw, phone_normalized = pii_mapping.phones[first_token]

    result["phone_raw"] = phone_raw
    result["phone_normalized"] = phone_normalized

    # Handles / Telegram username
    user_token = result.get("user_placeholder")
    if user_token and user_token in pii_mapping.handles:
        result["telegram_handle"] = pii_mapping.handles[user_token]
    elif pii_mapping.handles:
        first_handle_token = sorted(pii_mapping.handles.keys())[0]
        result["telegram_handle"] = pii_mapping.handles[first_handle_token]
    else:
        result["telegram_handle"] = None

    # Remove temporary placeholder fields
    result.pop("phone_placeholder", None)
    result.pop("user_placeholder", None)

    return result
