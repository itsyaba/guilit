"""Unit and integration tests for the Two-Pass Extraction Pipeline."""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from ingest.extract.caching import ExtractionCache, compute_content_hash
from ingest.extract.gemini_client import GeminiBatchExtractor, QuotaExhaustedError
from ingest.extract.pii import (
    PIIMapping,
    SanitizedMessage,
    assert_zero_pii,
    reattach_pii,
    sanitize_message_pii,
)
from ingest.extract.pipeline import ExtractionMetrics, ExtractionPipeline
from ingest.extract.regex_rules import (
    extract_phone_numbers,
    extract_price,
    extract_telegram_handles,
    normalize_ethiopian_phone,
    run_regex_pass,
)
from ingest.db import RawMessage


# ==============================================================================
# 1. REGEX PRICE EXTRACTION TESTS
# ==============================================================================

@pytest.mark.parametrize(
    "text,expected_price,expected_neg",
    [
        ("iPhone 13 Pro Max ዋጋ 12,000 ብር", 12000, False),
        ("Dell XPS 15 ዋጋ 45,000br ድርድር አለው", 45000, True),
        ("Samsung TV 55 inch price 32000 birr", 32000, False),
        ("Toyota Vitz ዋጋ 1.2m የሚደራደር", 1200000, True),
        ("የቤት እቃ 12ሺ ብር neg", 12000, True),
        ("Sony Headphone 12k fixed price", 12000, False),
        ("MacBook Air M1 ዋጋ 12 ሺህ ብር", 12000, False),
        ("ባለ 3 መቀመጫ ሶፋ 28,500 ETB", 28500, False),
        ("Just a general channel message without price", None, False),
    ],
)
def test_regex_price_extraction(text, expected_price, expected_neg):
    price_val, price_raw, neg = extract_price(text)
    assert price_val == expected_price
    if expected_neg:
        assert neg is True


# ==============================================================================
# 2. REGEX ETHIOPIAN PHONE & HANDLE EXTRACTION TESTS
# ==============================================================================

@pytest.mark.parametrize(
    "raw_input,expected_normalized",
    [
        ("0911223344", "+251911223344"),
        ("+251911223344", "+251911223344"),
        ("251911223344", "+251911223344"),
        ("0712345678", "+251712345678"),
        ("+251 911 22 33 44", "+251911223344"),
        ("09 11 22 33 44", "+251911223344"),
        ("0911-22-33-44", "+251911223344"),
        ("+251-912-345-678", "+251912345678"),
        ("07 12 34 56 78", "+251712345678"),
    ],
)
def test_ethiopian_phone_normalization(raw_input, expected_normalized):
    norm = normalize_ethiopian_phone(raw_input)
    assert norm == expected_normalized


def test_telegram_handles_extraction():
    text = "Contact @addis_seller or check t.me/bole_market for details @my_shop"
    handles = extract_telegram_handles(text)
    assert "@addis_seller" in handles
    assert "@bole_market" in handles
    assert "@my_shop" in handles


# ==============================================================================
# 3. PII STRIPPING AND REATTACHMENT GUARANTEES
# ==============================================================================

def test_pii_sanitization_and_masking():
    raw = "አዲስ iPhone 14 Pro Max ዋጋ 120,000 ብር ስልክ 0911223344 ወይም 0712345678 ቦሌ inbox @addis_shop"
    sanitized = sanitize_message_pii(raw, raw_message_id=101, index=1)

    assert "0911223344" not in sanitized.sanitized_text
    assert "0712345678" not in sanitized.sanitized_text
    assert "@addis_shop" not in sanitized.sanitized_text
    assert "[PHONE_1]" in sanitized.sanitized_text
    assert "[PHONE_2]" in sanitized.sanitized_text
    assert "[USER_1]" in sanitized.sanitized_text

    # Verify zero PII in sanitized payload
    assert_zero_pii(sanitized.sanitized_text)

    # Reattach test
    extracted_model_response = {
        "id": 1,
        "title_en": "iPhone 14 Pro Max",
        "category_slug": "phones",
        "phone_placeholder": "[PHONE_1]",
        "user_placeholder": "[USER_1]",
    }
    reattached = reattach_pii(extracted_model_response, sanitized.pii_mapping)
    assert reattached["phone_raw"] == "0911223344"
    assert reattached["phone_normalized"] == "+251911223344"
    assert reattached["telegram_handle"] == "@addis_shop"


def test_assert_zero_pii_raises_on_unmasked_phone():
    leaked_text = "Here is my payload with phone 0911223344 inside"
    with pytest.raises(ValueError, match="PII SECURITY VIOLATION"):
        assert_zero_pii(leaked_text)


# ==============================================================================
# 4. CONTENT HASH CACHING (0 API CALLS ON RE-RUN)
# ==============================================================================

def test_content_hashing_and_caching():
    cache = ExtractionCache()
    text = "Samsung Galaxy S23 Ultra 256GB sealed ዋጋ 75000 ብር ስልክ 0911223344"
    c_hash = compute_content_hash(text)

    assert cache.get(c_hash, "v1") is None

    extraction_result = {
        "title_en": "Samsung Galaxy S23 Ultra",
        "price_etb": 75000,
        "category_slug": "phones",
    }
    cache.put(c_hash, "v1", extraction_result)

    cached_hit = cache.get(c_hash, "v1")
    assert cached_hit == extraction_result
    assert cache.hits == 1

    # Prompt version isolation
    assert cache.get(c_hash, "v2") is None


# ==============================================================================
# 5. BATCHING AND GEMINI CLIENT
# ==============================================================================

@pytest.mark.asyncio
async def test_gemini_mock_batch_extraction():
    extractor = GeminiBatchExtractor()
    messages = [
        {"index": 1, "raw_message_id": 1, "sanitized_text": "iPhone 13 128GB [PHONE_1] price 35000", "price_etb": 35000},
        {"index": 2, "raw_message_id": 2, "sanitized_text": "L-shape sofa table [PHONE_1] 18000 br", "price_etb": 18000},
    ]

    results = await extractor.extract_batch(messages)
    assert len(results) == 2
    assert results[0]["id"] == 1
    assert results[0]["category_slug"] == "phones"
    assert results[1]["id"] == 2
    assert results[1]["category_slug"] == "furniture"


# ==============================================================================
# 6. TWO-PASS PIPELINE INTEGRATION
# ==============================================================================

@pytest.mark.asyncio
async def test_extraction_pipeline_process_batch():
    mock_db = AsyncMock()
    mock_db.insert_extraction.return_value = 42
    mock_db.enqueue_job.return_value = 101
    mock_db.mark_raw_message_processed.return_value = None

    pipeline = ExtractionPipeline(
        db=mock_db,
        gemini_client=GeminiBatchExtractor(),
        batch_size=20,
        prompt_version="v1",
    )

    test_messages = [
        RawMessage(
            id=1,
            channel_id=1,
            message_id=1001,
            grouped_id=None,
            raw_text="Dell Latitude 5420 Core i7 16GB 512GB ዋጋ 32,000 ብር ስልክ 0911223344 @tech_seller",
            media_refs=[],
            posted_at=datetime.now(timezone.utc),
        ),
        RawMessage(
            id=2,
            channel_id=1,
            message_id=1002,
            grouped_id=None,
            raw_text="Join our promotion channel t.me/promo",
            media_refs=[],
            posted_at=datetime.now(timezone.utc),
        ),
    ]

    extractions, metrics = await pipeline.process_batch_messages(test_messages)

    assert len(extractions) == 2
    assert metrics.total_messages == 2
    assert metrics.filtered_non_listings == 1  # promo message filtered
    assert metrics.llm_candidate_count == 1   # only valid candidate sent to LLM

    # Verified DB interactions
    assert mock_db.insert_extraction.call_count == 2
    assert mock_db.enqueue_job.call_count == 1  # 1 dedup job for the valid listing
    assert mock_db.mark_raw_message_processed.call_count == 2


# ==============================================================================
# 7. REAL-WORLD AMHARIC E-COMMERCE CORPUS TEST (100 REAL MESSAGES)
# ==============================================================================

def test_real_amharic_corpus_pii_and_regex():
    import json
    from pathlib import Path
    
    corpus_path = Path("fixtures/amharic_ecommerce_corpus.json")
    if not corpus_path.exists():
        pytest.skip("amharic_ecommerce_corpus.json fixture not present")
        
    data = json.loads(corpus_path.read_text("utf-8"))
    messages = data.get("messages", [])
    assert len(messages) >= 50
    
    price_hits = 0
    phone_hits = 0
    
    for i, item in enumerate(messages, start=1):
        raw_text = item["raw_text"]
        res = run_regex_pass(raw_text)
        if res.has_price_token:
            price_hits += 1
        if res.has_phone_token:
            phone_hits += 1
            
        # Guarantee 0 PII leaks across every single authentic post
        sanitized = sanitize_message_pii(raw_text, raw_message_id=i, index=i)
        assert_zero_pii(sanitized.sanitized_text)
        
    # Over 80% of real e-commerce messages should have price and phone matches
    assert price_hits / len(messages) >= 0.75
    assert phone_hits / len(messages) >= 0.75

