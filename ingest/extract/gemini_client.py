"""Gemini Batch Extraction Client.

Implements batched LLM calls (up to 20 messages per request) using Google Gemini
with responseMimeType="application/json", exponential backoff, and 429 quota handling.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from typing import Any, Dict, List, Optional
import httpx
from pydantic import BaseModel, Field

from ingest.config import settings
from ingest.extract.pii import assert_zero_pii

logger = logging.getLogger(__name__)

# System prompt defining taxonomy, extraction rules, and bilingual output
EXTRACTION_SYSTEM_PROMPT = """You are an expert Ethiopian e-commerce data extraction pipeline.
You extract structured marketplace listings from Telegram channels in Addis Ababa.

TAXONOMY CATEGORIES (you MUST choose only one of these exact slugs):
- "phones" (Mobile phones, smartphones, tablets, chargers, smartwatches)
- "computers" (Laptops, desktops, monitors, computer accessories, GPUs, RAM, SSDs)
- "furniture" (Sofas, beds, tables, chairs, wardrobes, cupboards)
- "appliances" (Refrigerators, washing machines, microwaves, stoves, irons)
- "tv-audio" (Televisions, speakers, sound systems, headphones, home theater)
- "vehicles" (Cars, motorcycles, bajaj, car parts, tires)
- "fashion" (Clothes, shoes, bags, jackets, dresses, watches, jewelry)
- "kids" (Baby items, strollers, toys, kids clothes, car seats)
- "books" (Textbooks, novels, hobby items, stationery)
- "tools" (Power tools, drills, generators, hardware, machinery)
- "other" (Miscellaneous items not matching above)

CONDITION VALUES (MUST choose one):
- "brand_new" (New in box, never used, sealed)
- "lightly_used" (Gently used, excellent condition, minimal wear)
- "fair" (Clearly used, noticeable wear, functional)

INSTRUCTIONS:
1. Input consists of numbered sanitized messages: [MSG_1], [MSG_2], etc.
2. For each message, determine if it is a marketplace listing for sale (is_listing: true/false).
3. If not a listing (e.g. channel promo, spam, general announcement, buy request), set is_listing: false, confidence_score: 0.0.
4. If it is a listing:
   - title_en: Concise title in English (e.g. "iPhone 13 Pro Max 256GB Sierra Blue")
   - title_am: Concise title in Amharic (e.g. "አይፎን 13 ፕሮ ማክስ 256GB")
   - description_en: 1-2 sentence cleaned summary in English
   - description_am: 1-2 sentence cleaned summary in Amharic
   - category_slug: exact category slug from taxonomy
   - condition: "brand_new", "lightly_used", or "fair"
   - location_area: Neighborhood/Area in Addis Ababa (e.g. "Bole", "Piassa", "Merkato", "Megenagna", "Sarbet", "CMC", "Gerji", "Mexico") or null
   - location_city: Default "Addis Ababa"
   - price_etb: Integer price in ETB (convert 12k/12ሺ to 12000) or null if not stated
   - negotiable: true if message mentions "የሚደራደር", "ድርድር", "negotiable", "neg"
   - phone_placeholder: placeholder token like "[PHONE_1]" if present
   - user_placeholder: placeholder token like "[USER_1]" if present
   - confidence_score: Honest float between 0.0 and 1.0 representing your confidence in this extraction
5. Return a strict JSON array of objects with an entry for each message matching its "id".
"""

# JSON Schema for batched response
GEMINI_RESPONSE_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "id": {"type": "integer", "description": "Message index (e.g. 1 for MSG_1)"},
            "is_listing": {"type": "boolean"},
            "title_en": {"type": "string"},
            "title_am": {"type": "string"},
            "description_en": {"type": "string"},
            "description_am": {"type": "string"},
            "category_slug": {
                "type": "string",
                "enum": [
                    "phones",
                    "computers",
                    "furniture",
                    "appliances",
                    "tv-audio",
                    "vehicles",
                    "fashion",
                    "kids",
                    "books",
                    "tools",
                    "other",
                ],
            },
            "condition": {
                "type": "string",
                "enum": ["brand_new", "lightly_used", "fair"],
            },
            "location_area": {"type": "string"},
            "location_city": {"type": "string"},
            "price_etb": {"type": "integer"},
            "negotiable": {"type": "boolean"},
            "phone_placeholder": {"type": "string"},
            "user_placeholder": {"type": "string"},
            "confidence_score": {"type": "number"},
        },
        "required": ["id", "is_listing", "confidence_score"],
    },
}


class QuotaExhaustedError(Exception):
    """Raised when Gemini returns 429 Resource Exhausted / Daily Quota Limit."""

    def __init__(self, message: str, retry_after_seconds: float = 60.0):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class GeminiBatchExtractor:
    """Client for executing batched, PII-scrubbed extraction calls against Gemini API."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        self.api_key = api_key or settings.GEMINI_API_KEY
        self.model = model or settings.GEMINI_MODEL
        self.base_url = (base_url or settings.GEMINI_API_BASE_URL).rstrip("/")
        self.timeout = httpx.Timeout(60.0, connect=10.0)
        self.total_requests_made = 0
        self.total_messages_processed = 0

    @property
    def is_mock_mode(self) -> bool:
        """Returns True if no API key is configured or set to mock."""
        return not self.api_key or self.api_key.lower() in ("mock", "none", "")

    def format_batch_prompt(self, sanitized_messages: List[Dict[str, Any]]) -> str:
        """Formats a list of sanitized messages into a single numbered batch prompt."""
        parts = ["Please extract structured listings from the following messages:"]
        for msg in sanitized_messages:
            idx = msg["index"]
            text = msg["sanitized_text"].strip()
            parts.append(f"\n--- [MSG_{idx}] ---\n{text}")
        return "\n".join(parts)

    async def extract_batch(
        self,
        sanitized_messages: List[Dict[str, Any]],
        max_retries: int = 4,
    ) -> List[Dict[str, Any]]:
        """Sends a batch of up to 20 sanitized messages to Gemini.

        Guarantees:
        1. Checks zero real Ethiopian phone numbers exist in outbound payload.
        2. Consumes exactly 1 LLM request for the entire batch.
        3. Handles 429 quota exhaustion with backoff.
        """
        if not sanitized_messages:
            return []

        prompt_body = self.format_batch_prompt(sanitized_messages)

        # 1. SECURITY AUDIT: Verify zero PII in the batch payload string before network call
        assert_zero_pii(prompt_body)

        if self.is_mock_mode:
            logger.info(
                f"[extract.gemini] Mock mode active — simulating Gemini extraction for batch of {len(sanitized_messages)} messages"
            )
            self.total_requests_made += 1
            self.total_messages_processed += len(sanitized_messages)
            return self._mock_batch_extraction(sanitized_messages)

        endpoint = f"{self.base_url}/models/{self.model}:generateContent?key={self.api_key}"

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": f"{EXTRACTION_SYSTEM_PROMPT}\n\n{prompt_body}"}],
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": GEMINI_RESPONSE_SCHEMA,
                "temperature": 0.1,
                "maxOutputTokens": 8192,
            },
        }

        # Log sanitized payload preview for auditing (first 200 chars)
        logger.debug(
            f"[extract.gemini] Outbound request body verified clean (len={len(prompt_body)} chars)"
        )

        backoff = 2.0
        for attempt in range(1, max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    start_time = time.monotonic()
                    resp = await client.post(endpoint, json=payload)
                    duration = time.monotonic() - start_time

                    if resp.status_code == 200:
                        self.total_requests_made += 1
                        self.total_messages_processed += len(sanitized_messages)
                        data = resp.json()
                        raw_json_str = (
                            data.get("candidates", [{}])[0]
                            .get("content", {})
                            .get("parts", [{}])[0]
                            .get("text", "[]")
                        )
                        parsed_items = json.loads(raw_json_str)
                        logger.info(
                            f"[extract.gemini] Batch extraction succeeded | msgs={len(sanitized_messages)} duration={duration:.2f}s requests_total={self.total_requests_made}"
                        )
                        return parsed_items

                    elif resp.status_code == 429:
                        # Rate limit or quota exhausted
                        retry_header = resp.headers.get("retry-after")
                        wait_sec = float(retry_header) if retry_header else backoff
                        logger.warning(
                            f"[extract.gemini] Gemini 429 Quota Exceeded on attempt {attempt}/{max_retries}. Backing off {wait_sec:.1f}s"
                        )
                        if attempt == max_retries:
                            raise QuotaExhaustedError(
                                f"Gemini API quota exhausted (HTTP 429): {resp.text}",
                                retry_after_seconds=wait_sec,
                            )
                        await asyncio.sleep(wait_sec + random.uniform(0.5, 2.0))
                        backoff *= 2.0

                    elif resp.status_code >= 500:
                        logger.warning(
                            f"[extract.gemini] Gemini 5xx Server Error ({resp.status_code}) on attempt {attempt}/{max_retries}."
                        )
                        if attempt == max_retries:
                            resp.raise_for_status()
                        await asyncio.sleep(backoff)
                        backoff *= 2.0
                    else:
                        resp.raise_for_status()

            except (httpx.RequestError, httpx.HTTPStatusError) as exc:
                if attempt == max_retries:
                    logger.error(f"[extract.gemini] Request failed after {max_retries} attempts: {exc}")
                    raise
                await asyncio.sleep(backoff)
                backoff *= 2.0

        return []

    def _mock_batch_extraction(
        self,
        sanitized_messages: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Deterministic high-fidelity mock extraction for testing and zero-API-key runs."""
        results = []
        for msg in sanitized_messages:
            idx = msg["index"]
            text = msg["sanitized_text"]
            lower_text = text.lower()

            # Detect category (specific to general)
            category = "other"
            if any(k in lower_text for k in ("laptop", "macbook", "dell", "hp", "thinkpad", "latitude", "desktop", "core i", "ssd", "ram", "ኮምፒውተር", "ፕሪንተር", "ማተሚያ")):
                category = "computers"
            elif any(k in lower_text for k in ("sofa", "bed", "table", "chair", "dining", "mattress", "አልጋ", "ሶፋ", "ጠረጴዛ", "ወንበር", "የቤት እቃ")):
                category = "furniture"
            elif any(k in lower_text for k in ("car", "vitz", "toyota", "rav4", "መኪና", "ተሽከርካሪ")):
                category = "vehicles"
            elif any(k in lower_text for k in ("tv", "playstation", "ps5", "sony", "lg", "speaker", "sound", "ድምጽ", "ቴሌቪዥን")):
                category = "tv-audio"
            elif any(k in lower_text for k in ("fridge", "refrigerator", "microwave", "ማጠቢያ", "ፍሪጅ", "የልብስ ማጠቢያ")):
                category = "appliances"
            elif any(k in lower_text for k in ("dress", "shoes", "jacket", "ጥልፍ", "ቀሚስ", "ልብስ", "ጫማ")):
                category = "fashion"
            elif any(k in lower_text for k in ("iphone", "samsung galaxy", "redmi", "infinix", "tecno", "ipad", "ቴድሚ", "ካሞን", "ስልክ")):
                category = "phones"
            elif any(k in lower_text for k in ("drill", "bosch", "መሰርሰሪያ", "እቃ መገጣጠሚያ")):
                category = "tools"
            elif any(k in lower_text for k in ("ህፃናት", "ልጆች", "baby", "stroller")):
                category = "kids"


            # Detect condition
            condition = "lightly_used"
            if any(k in lower_text for k in ("brand new", "new in box", "አዲስ", "sealed")):
                condition = "brand_new"
            elif any(k in lower_text for k in ("fair", "መካከለኛ")):
                condition = "fair"

            # Detect location
            location = "Bole"
            for area in ("Bole", "Piassa", "Merkato", "Megenagna", "Sarbet", "CMC", "Gerji", "Mexico", "ቦሌ", "ፒያሳ", "መገናኛ"):
                if area.lower() in lower_text:
                    location = area.title()
                    break

            # Find placeholders
            phone_placeholder = "[PHONE_1]" if "[PHONE_1]" in text else None
            user_placeholder = "[USER_1]" if "[USER_1]" in text else None

            # Determine title & confidence
            words = text.split()
            first_line = text.split("\n")[0] if text else "Marketplace Item"
            title_clean = first_line[:50]

            is_listing = len(words) >= 3 and not lower_text.startswith("http")
            confidence = 0.88 if is_listing else 0.0

            results.append(
                {
                    "id": idx,
                    "is_listing": is_listing,
                    "title_en": title_clean if is_listing else None,
                    "title_am": first_line[:50] if is_listing else None,
                    "description_en": text[:150] if is_listing else None,
                    "description_am": text[:150] if is_listing else None,
                    "category_slug": category if is_listing else None,
                    "condition": condition if is_listing else None,
                    "location_area": location if is_listing else None,
                    "location_city": "Addis Ababa",
                    "price_etb": msg.get("price_etb"),
                    "negotiable": msg.get("negotiable"),
                    "phone_placeholder": phone_placeholder,
                    "user_placeholder": user_placeholder,
                    "confidence_score": confidence,
                }
            )

        return results
