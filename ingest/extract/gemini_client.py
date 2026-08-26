"""Gemini Batch Extraction Client.

Implements batched LLM calls (up to 20 messages per request) using Google Gemini
with responseMimeType="application/json", exponential backoff, and 429 quota handling.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import re
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
- "electronics" (Cameras, projectors, drones, smartwatches, routers, solar)
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
                    "electronics",
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


# ==============================================================================
# Offline classifier — used when no GEMINI_API_KEY is configured.
#
# This runs far more often than its name suggests: with a blank key (the default
# in .env.example) it is the ONLY thing that has ever labelled our corpus. Treat
# its output as production data, because it is.
#
# Two rules, learned the hard way:
#
# 1. Never classify on the contact line. "ስልክ" is Amharic for *phone*, and it is
#    also the label sellers put before their number ("ስልክ: 09..."). 74 of 89
#    messages in our corpus contain it. Matching it as a phones keyword filed a
#    Suzuki Alto, a bajaj, a generator and an injera mitad under "phones".
#
# 2. Longest matching keyword wins, not first branch to match. A cascade cannot
#    express that "የልብስ ማጠቢያ" (washing machine) is an appliance even though it
#    contains "ልብስ" (clothes), or that "የሕፃናት አልጋ" is a kids item even though it
#    contains "አልጋ" (bed). Specificity is the signal; branch order is not.
# ==============================================================================

CONTACT_LINE_RE = re.compile(
    r"(?im)^\s*(?:ስልክ|ስልክ\s*ቁጥር|phone|tel|telephone|call|mobile|contact|አድራሻ)\s*[:：\-]?\s*.*$"
)

#: Ordered only for tie-breaks — see classify_category. Keys are category slugs
#: from the taxonomy above; membership must stay in sync with the enum there.
CATEGORY_KEYWORDS: Dict[str, tuple] = {
    "vehicles": (
        "toyota", "vitz", "rav4", "corolla", "hilux", "suzuki", "alto", "hyundai",
        "isuzu", "bajaj", "motorcycle", "motorbike", "car for sale", "sinotruk",
        "ቶዮታ", "ሱዙኪ", "ሁንዳይ", "ራቭ4", "ቪትዝ", "አልቶ", "ግራንድ i10",
        "mountain bike", "bicycle", "ብስክሌት",
        "መኪና", "ተሽከርካሪ", "ባጃጅ", "ሞተር ሳይክል", "ሞተረኛ", "ጎማ", "ሊፍቲንግ",
    ),
    "computers": (
        "laptop", "macbook", "thinkpad", "latitude", "elitebook", "probook",
        "desktop", "core i3", "core i5", "core i7", "core i9", "ryzen", "ssd",
        "gaming pc", "monitor", "printer", "keyboard", "graphics card", "rtx",
        "ኮምፒውተር", "ላፕቶፕ", "ፕሪንተር", "ማተሚያ", "ኪቦርድ", "ማክቡክ", "ቲንክፓድ",
        "ሌኖቮ", "ዴል", "ኤችፒ", "ኤስኤስዲ", "ራም", "ኮር i3", "ኮር i5", "ኮር i7",
    ),
    "phones": (
        "iphone", "samsung galaxy", "galaxy a", "galaxy s", "redmi", "xiaomi",
        "infinix", "tecno", "camon", "oppo", "vivo", "ipad", "tablet", "airpods",
        "smartphone", "dual sim", "power bank",
        "አይፎን", "ታብሌት", "ሬድሚ", "ቴክኖ", "ስማርት ፎን", "ሲም ካርድ", "ሳምሱንግ ጋላክሲ",
        "ጋላክሲ", "ኢንፊኒክስ", "ካሞን", "አይፓድ", "ኤርፖድስ",
    ),
    "tv-audio": (
        "smart tv", "led tv", "television", "playstation", "ps4", "ps5", "xbox",
        "soundbar", "speaker", "home theater", "home theatre", "headphone", "jbl",
        "subwoofer",
        "ቴሌቪዥን", "ስማርት ቲቪ", "ቲቪ", "ድምጽ ማጉያ", "ስፒከር", "ማጫወቻ",
        "acoustic guitar", "guitar", "keyboard piano", "አኮስቲክ ጊታር", "ጊታር",
        "ፕሌይስቴሽን", "ሳውንድባር", "ሆም ቲያትር", "ጄቢኤል", "ሂሴንስ", "ሶኒ",
    ),
    "appliances": (
        "refrigerator", "fridge", "freezer", "microwave", "washing machine",
        "air fryer", "blender", "gas stove", "oven", "water dispenser", "mitad",
        "የልብስ ማጠቢያ", "ማቀዝቀዣ", "ፍሪጅ", "ምጣድ", "ማይክሮዌቭ", "ምድጃ", "ጭስ ማውጫ",
        "ጋዝ ምድጃ ከነ", "የውሃ ማቀዝቀዣ",
        "ኤር ፍራየር", "ፍራየር", "ጋዝ ምድጃ",
    ),
    "tools": (
        "generator", "welding machine", "welding", "drill", "grinder", "compressor",
        "tool set", "angle grinder", "hammer drill",
        "wrench", "hand tool", "power tool", "bosch",
        "ጀነሬተር", "መሰርሰሪያ", "እቃ መገጣጠሚያ", "የስራ መሳሪያ", "ማብሪያ", "ቦሽ", "የብየዳ ማሽን",
        "አንግል ግራይንደር",
    ),
    "kids": (
        "baby", "infant", "toddler", "kids", "stroller", "car seat", "baby cot",
        "baby walker", "montessori", "baby swing", "diaper", "toy", "romper",
        "kids bicycle", "kids bike", "የልጆች ብስክሌት", "የሕፃናት ብስክሌት",
        "pacifier", "breast milk", "breast pump", "sterilizer", "mama bag",
        "baby carier", "baby carrier", "high chair", "potty", "bib", "onesie",
        "chicco", "infantino", "avent", "nursing", "feeding bottle", "lunch box",
        "የሕፃናት", "ሕፃናት", "ህፃናት", "የልጆች", "ልጆች", "መጫወቻ", "ዥዋዥዌ", "ጡጦ",
    ),
    "furniture": (
        "sofa", "l-shape", "couch", "wardrobe", "dining table", "coffee table",
        "mattress", "bed frame", "bookshelf", "cupboard", "office chair", "mesob",
        "መሶብ",
        "የቤት እቃ", "ሶፋ", "ቁም ሳጥን", "ጠረጴዛ", "ወንበር", "አልጋ", "ፍራሽ", "መደርደሪያ",
    ),
    "fashion": (
        "dress", "shoes", "sneakers", "jacket", "handbag", "backpack", "suitcase",
        "wristwatch", "jewelry", "netela", "habesha kemis", "t-shirt",
        "nike", "adidas", "jordan", "puma", "samsonite", "luggage",
        "ናይክ", "አዲዳስ", "ጆርዳን", "ሳምሶናይት", "ካሲዮ",
        "helmet", "ሄልሜት", "የሞተር ሳይክል ጃኬት",
        "ቀሚስ", "ጫማ", "ጃኬት", "ቦርሳ", "ሰዓት", "ነጠላ", "ሻንጣ", "ልብስ",
    ),
    "books": (
        "textbook", "novel", "dictionary", "stationery", "encyclopedia",
        "book collection", "books",
        "መጽሐፍ", "መጽሐፍት", "ጥራዝ", "ደብተር",
    ),
    "electronics": (
        "camera", "dslr", "projector", "drone", "smartwatch", "router", "inverter",
        "solar panel", "blood pressure", "oximeter", "thermometer", "nebulizer",
        "wifi router", "router", "ራውተር", "ሶላር ፓናል",
        "ካሜራ", "ፕሮጀክተር", "ሶላር", "የህክምና እቃ",
    ),
}

#: Amharic and mis-cased spellings collapse to the English canonical, which is
#: what listings.location_area stores and what the browse `area` filter matches
#: on exactly. A .title() here is what produced "Cmc" in the live table.
AREA_CANONICAL: Dict[str, str] = {
    "bole": "Bole", "ቦሌ": "Bole",
    "piassa": "Piassa", "piazza": "Piassa", "ፒያሳ": "Piassa",
    "merkato": "Merkato", "መርካቶ": "Merkato",
    "megenagna": "Megenagna", "መገናኛ": "Megenagna",
    "sarbet": "Sarbet", "ሳርቤት": "Sarbet",
    "cmc": "CMC", "ሲኤምሲ": "CMC",
    "gerji": "Gerji", "ገርጂ": "Gerji",
    "kazanchis": "Kazanchis", "ካዛንቺስ": "Kazanchis",
    "ayat": "Ayat", "አያት": "Ayat",
    "summit": "Summit", "ሰሚት": "Summit",
    "lebu": "Lebu", "ለቡ": "Lebu",
    "saris": "Saris", "ሳሪስ": "Saris",
    "jemo": "Jemo", "ጀሞ": "Jemo",
    "kolfe": "Kolfe", "ኮልፌ": "Kolfe",
    "shiro meda": "Shiro Meda", "ሽሮ ሜዳ": "Shiro Meda",
    "arat kilo": "Arat Kilo", "አራት ኪሎ": "Arat Kilo",
    "gurd shola": "Gurd Shola", "ጉርድ ሾላ": "Gurd Shola",
    "hayahulet": "Hayahulet", "ሃያሁለት": "Hayahulet",
    "kality": "Kality", "ቃሊቲ": "Kality",
    "old airport": "Old Airport", "ኦልድ ኤርፖርት": "Old Airport",
    "ayer tena": "Ayer Tena", "አየር ጤና": "Ayer Tena",
    "torhailoch": "Torhailoch", "ቶር ሃይሎች": "Torhailoch",
    "mexico": "Mexico", "ሜክሲኮ": "Mexico",
}

CONDITION_KEYWORDS: Dict[str, tuple] = {
    "brand_new": ("brand new", "new in box", "sealed", "unopened", "unused",
                  "አዲስ", "ያልተከፈተ", "አልተከፈተም"),
    "fair": ("fair condition", "well used", "scratched", "worn", "needs repair",
             "መካከለኛ", "ያገለገለ", "ተጠግኖ"),
    "lightly_used": ("lightly used", "gently used", "like new", "second hand",
                     "excellent condition", "clean", "neat", "used for",
                     "barely used", "ንፁህ", "ፅዱ", "ትንሽ የተሰራበት", "ሁለተኛ እጅ",
                     "ጥሩ ሁኔታ", "የተጠቀምኩበት", "ጥቅም ላይ የዋለ", "በጣም ጥሩ"),
}


def strip_contact_lines(text: str) -> str:
    """Removes phone/address lines so their labels can't be read as item nouns."""
    return CONTACT_LINE_RE.sub(" ", text or "")


def classify_category(text: str) -> str:
    """Longest matching keyword wins; ties break on CATEGORY_KEYWORDS order."""
    lowered = (text or "").lower()
    best_slug, best_len, best_rank = "other", 0, 999
    for rank, (slug, keywords) in enumerate(CATEGORY_KEYWORDS.items()):
        for keyword in keywords:
            if keyword in lowered and (
                len(keyword) > best_len
                or (len(keyword) == best_len and rank < best_rank)
            ):
                best_slug, best_len, best_rank = slug, len(keyword), rank
    return best_slug


def classify_condition(text: str) -> Optional[str]:
    """Returns None when nothing matched.

    Defaulting to "lightly_used" is what left our corpus with 74 lightly_used and
    zero fair. listings.condition is nullable and the price buckets treat NULL as
    "any condition" — a guess here silently poisons a statistic downstream.
    """
    lowered = (text or "").lower()
    best_value, best_len = None, 0
    for value, keywords in CONDITION_KEYWORDS.items():
        for keyword in keywords:
            if keyword in lowered and len(keyword) > best_len:
                best_value, best_len = value, len(keyword)
    return best_value


def classify_area(text: str) -> Optional[str]:
    """Canonical English area name, or None. Never guesses a default.

    Returns None when the message names more than one area. Reseller channels
    append a footer listing every branch they operate ("ገርጂ ... 4ኪሎ ... ላፍቶ"),
    which appears in 90 of our 100 corpus messages — picking one of those would
    tag the item with a shop's address rather than where the item is.
    """
    lowered = (text or "").lower()
    found = {canonical for spelling, canonical in AREA_CANONICAL.items() if spelling in lowered}
    return found.pop() if len(found) == 1 else None



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
            classifiable = strip_contact_lines(text)

            category = classify_category(classifiable)
            condition = classify_condition(classifiable)
            location = classify_area(classifiable)
            lower_text = text.lower()

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
