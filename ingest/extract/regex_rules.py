"""Regex extraction rules for prices, Ethiopian phone numbers, and Telegram handles.

This is Pass 1 of the two-pass extraction architecture:
1. Fast, deterministic, zero-LLM regex extraction.
2. Extracts prices, currency, negotiability, and normalizes phone numbers to +251...
3. Acts as the listing filter: messages lacking price/listing tokens are filtered
   as `not_a_listing` without consuming Gemini quota.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple
from pydantic import BaseModel


class RegexExtractionResult(BaseModel):
    """Result from Regex Pass 1."""

    price_raw: Optional[str] = None
    price_etb: Optional[int] = None
    negotiable: Optional[bool] = None
    currency: str = "ETB"
    phone_raw: Optional[str] = None
    phone_normalized: Optional[str] = None
    all_phones: List[str] = []
    all_phones_normalized: List[str] = []
    telegram_handles: List[str] = []
    has_price_token: bool = False
    has_phone_token: bool = False
    has_handle_token: bool = False
    is_potential_listing: bool = False


# ==============================================================================
# 1. PHONE REGEX PATTERNS (Ethiopian telecom: Ethio Telecom 09, Safaricom 07)
# ==============================================================================

# Matches any Ethiopian phone number (+251 9/7..., 09..., 07..., 9...) with arbitrary spaces/dashes
ETHIO_PHONE_REGEX = re.compile(
    r"""
    (?<!\d)
    (?:
        (?:\+|00)?251[\s.-]?[97](?:[\s.-]?\d){8} |
        0[97](?:[\s.-]?\d){8} |
        (?:\b[97](?:[\s.-]?\d){8}\b)
    )
    (?!\d)
    """,
    re.VERBOSE,
)


# ==============================================================================
# 2. TELEGRAM HANDLES & LINKS
# ==============================================================================

TG_HANDLE_PATTERN = re.compile(r"(?<!\w)@([a-zA-Z0-9_]{4,32})(?!\w)")
TG_LINK_PATTERN = re.compile(r"(?:https?://)?(?:t(?:elegram)?\.me)/([a-zA-Z0-9_]{4,32})", re.IGNORECASE)

# ==============================================================================
# 3. PRICE REGEX PATTERNS & MULTIPLIERS (Amharic & English)
# ==============================================================================

# Currency / Price words in Amharic & English
CURRENCY_WORDS = r"(?:ብር|birr|br|etb|dollar|\$)"
PRICE_PREFIXES = r"(?:ዋጋ|መነሻ|መነሻ\s*ዋጋ|price|fixed\s*price|fixed|ዋጋው)"

# Patterns like:
# 12,000 ብር, 12000birr, 12,000br, 12k, 12ሺ, 12 ሺህ, 12.5k, 1.2m, 1.2 ሚሊዮን, ዋጋ 12000
PRICE_PATTERNS = [
    # 1. Number followed by thousand/million suffix (12k, 12ሺ, 12 ሺህ, 12.5k, 1.2m)
    re.compile(
        r"(?<!\w)(\d+(?:[.,]\d+)?)\s*(k|K|ሺ|ሺህ|ሽ|m|M|ሚሊዮን|ሚ)(?:\s*" + CURRENCY_WORDS + r")?(?!\w)",
        re.IGNORECASE,
    ),
    # 2. Number followed by currency (12,000 ብር, 12000 birr, 12,000br, 12000 etb)
    re.compile(
        r"(?<!\w)(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*" + CURRENCY_WORDS + r"(?!\w)",
        re.IGNORECASE,
    ),
    # 3. Prefix followed by number (ዋጋ: 12000, ዋጋ 12,000, price: 12000, price 12k)
    re.compile(
        PRICE_PREFIXES + r"[\s:፡-]*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|K|ሺ|ሺህ|ሽ|m|M|ሚሊዮን|ሚ)?(?:\s*" + CURRENCY_WORDS + r")?",
        re.IGNORECASE,
    ),
    # 4. Standalone comma-formatted numbers >= 500 when price words exist in text
    re.compile(r"(?<!\w)(\d{1,3}(?:,\d{3})+)(?!\w)"),
]

# Negotiable indicators
NEGOTIABLE_PATTERN = re.compile(
    r"(?:የሚደራደር|ድርድር|ይደራደራል|ድርድር\s*አለው|መነሻ\s*ዋጋ|negotiable|neg|slightly\s*negotiable)",
    re.IGNORECASE,
)

# Non-listing spam indicators (channel promotions, admin contacts only, rules)
NON_LISTING_PATTERNS = [
    re.compile(r"cross\s*promo|ፕሮሞሽን|ለማስተዋወቅ|join\s*our\s*channel|ቻናላችንን\s*ይቀላቀሉ", re.IGNORECASE),
    re.compile(r"^[\s\W]*welcome[\s\W]*$", re.IGNORECASE),
]


def normalize_ethiopian_phone(raw_phone: str) -> Optional[str]:
    """Normalizes an Ethiopian phone string to standard +251XXXXXXXXX format."""
    digits = re.sub(r"\D", "", raw_phone)
    
    # 2519xxxxxxxx or 2517xxxxxxxx (12 digits)
    if digits.startswith("251") and len(digits) == 12:
        return f"+{digits}"
    
    # 09xxxxxxxx or 07xxxxxxxx (10 digits)
    if digits.startswith("0") and len(digits) == 10 and digits[1] in ("9", "7"):
        return f"+251{digits[1:]}"
    
    # 9xxxxxxxx or 7xxxxxxxx (9 digits)
    if len(digits) == 9 and digits[0] in ("9", "7"):
        return f"+251{digits}"
    
    # 002519xxxxxxxx (14 digits)
    if digits.startswith("00251") and len(digits) == 14:
        return f"+{digits[2:]}"
    
    return None


def extract_phone_numbers(text: str) -> Tuple[List[str], List[str]]:
    """Extracts all raw and normalized phone numbers from text."""
    if not text:
        return [], []
    
    raw_phones: List[str] = []
    normalized_phones: List[str] = []
    
    # Clean up non-breaking spaces
    clean_text = text.replace("\xa0", " ")
    
    # Match any Ethiopian phone pattern
    for match in ETHIO_PHONE_REGEX.finditer(clean_text):
        raw = match.group(0).strip()
        norm = normalize_ethiopian_phone(raw)
        if norm and norm not in normalized_phones:
            raw_phones.append(raw)
            normalized_phones.append(norm)

    return raw_phones, normalized_phones



def extract_telegram_handles(text: str) -> List[str]:
    """Extracts all unique @handles and t.me/ links from text."""
    if not text:
        return []
    
    handles = set()
    for match in TG_HANDLE_PATTERN.finditer(text):
        handles.add(f"@{match.group(1)}")
        
    for match in TG_LINK_PATTERN.finditer(text):
        handles.add(f"@{match.group(1)}")
        
    return sorted(list(handles))


def parse_price_value(num_str: str, suffix: Optional[str] = None) -> Optional[int]:
    """Converts number string and unit multiplier suffix to integer ETB."""
    try:
        clean_num = num_str.replace(",", "").strip()
        val = float(clean_num)
        
        if suffix:
            suffix_clean = suffix.lower().strip()
            if suffix_clean in ("k", "ሺ", "ሺህ", "ሽ"):
                val *= 1000
            elif suffix_clean in ("m", "ሚሊዮን", "ሚ"):
                val *= 1000000
                
        int_val = int(round(val))
        # Basic sanity check: prices must be positive and realistically under 100M ETB
        if 50 <= int_val <= 150_000_000:
            return int_val
    except (ValueError, TypeError):
        pass
    return None


def extract_price(text: str) -> Tuple[Optional[int], Optional[str], Optional[bool]]:
    """Extracts price (integer ETB), raw price string, and negotiability from text."""
    if not text:
        return None, None, None
    
    # Check negotiability
    negotiable = bool(NEGOTIABLE_PATTERN.search(text))
    
    clean_text = text.replace("\xa0", " ")
    
    # Try suffix-based patterns first (12k, 12ሺ, 1.5m)
    for match in PRICE_PATTERNS[0].finditer(clean_text):
        num_part = match.group(1)
        suffix_part = match.group(2)
        price_val = parse_price_value(num_part, suffix_part)
        if price_val:
            return price_val, match.group(0).strip(), negotiable
            
    # Try currency-word patterns (12,000 ብር, 1500 birr)
    for match in PRICE_PATTERNS[1].finditer(clean_text):
        num_part = match.group(1)
        price_val = parse_price_value(num_part)
        if price_val:
            return price_val, match.group(0).strip(), negotiable
            
    # Try prefix patterns (ዋጋ: 12000)
    for match in PRICE_PATTERNS[2].finditer(clean_text):
        num_part = match.group(1)
        suffix_part = match.group(2) if len(match.groups()) >= 2 else None
        price_val = parse_price_value(num_part, suffix_part)
        if price_val:
            return price_val, match.group(0).strip(), negotiable

    # Try formatted numbers if currency words exist anywhere in the message
    if re.search(CURRENCY_WORDS, clean_text, re.IGNORECASE) or re.search(PRICE_PREFIXES, clean_text, re.IGNORECASE):
        for match in PRICE_PATTERNS[3].finditer(clean_text):
            num_part = match.group(1)
            price_val = parse_price_value(num_part)
            if price_val:
                return price_val, match.group(0).strip(), negotiable

    return None, None, negotiable if negotiable else None


def run_regex_pass(raw_text: Optional[str]) -> RegexExtractionResult:
    """Executes deterministic Pass 1 regex extraction and listing filtering."""
    if not raw_text or not raw_text.strip():
        return RegexExtractionResult(
            is_potential_listing=False,
            has_price_token=False,
            has_phone_token=False,
            has_handle_token=False,
        )
    
    text = raw_text.strip()
    
    # 1. Extract phones & handles
    raw_phones, norm_phones = extract_phone_numbers(text)
    handles = extract_telegram_handles(text)
    
    # 2. Extract price
    price_etb, price_raw, negotiable = extract_price(text)
    
    has_price = price_etb is not None
    has_phone = len(norm_phones) > 0
    has_handle = len(handles) > 0
    
    # 3. Filter check: A listing almost always has a price or strong listing intent
    is_spam = any(pattern.search(text) for pattern in NON_LISTING_PATTERNS)
    
    # Listing heuristic:
    # - Has price -> almost certainly listing
    # - Has phone + product/spec keywords -> candidate listing
    is_potential_listing = not is_spam and (
        has_price or 
        (has_phone and len(text.split()) >= 4 and not text.startswith("http"))
    )
    
    return RegexExtractionResult(
        price_raw=price_raw,
        price_etb=price_etb,
        negotiable=negotiable,
        currency="ETB",
        phone_raw=raw_phones[0] if raw_phones else None,
        phone_normalized=norm_phones[0] if norm_phones else None,
        all_phones=raw_phones,
        all_phones_normalized=norm_phones,
        telegram_handles=handles,
        has_price_token=has_price,
        has_phone_token=has_phone,
        has_handle_token=has_handle,
        is_potential_listing=is_potential_listing,
    )
