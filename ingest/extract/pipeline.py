"""Two-pass extraction pipeline coordinating Regex Pass 1, PII stripping, and batched Gemini Pass 2."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from ingest.config import settings
from ingest.db import Database, RawMessage
from ingest.extract.caching import compute_content_hash, global_extraction_cache
from ingest.extract.gemini_client import GeminiBatchExtractor, QuotaExhaustedError
from ingest.extract.pii import SanitizedMessage, assert_zero_pii, reattach_pii, sanitize_message_pii
from ingest.extract.regex_rules import RegexExtractionResult, run_regex_pass

logger = logging.getLogger(__name__)


@dataclass
class ExtractionMetrics:
    """Detailed telemetry and statistics for an extraction run."""

    total_messages: int = 0
    with_price_count: int = 0
    with_phone_count: int = 0
    with_both_count: int = 0
    filtered_non_listings: int = 0
    cached_hits: int = 0
    llm_candidate_count: int = 0
    llm_batches_sent: int = 0
    llm_requests_consumed: int = 0
    extractions_saved: int = 0
    jobs_enqueued: int = 0
    confidence_scores: List[float] = field(default_factory=list)

    @property
    def price_hit_rate(self) -> float:
        return (self.with_price_count / self.total_messages * 100.0) if self.total_messages > 0 else 0.0

    @property
    def phone_hit_rate(self) -> float:
        return (self.with_phone_count / self.total_messages * 100.0) if self.total_messages > 0 else 0.0

    @property
    def both_hit_rate(self) -> float:
        return (self.with_both_count / self.total_messages * 100.0) if self.total_messages > 0 else 0.0

    @property
    def filter_rate(self) -> float:
        return (self.filtered_non_listings / self.total_messages * 100.0) if self.total_messages > 0 else 0.0

    @property
    def request_compression_ratio(self) -> float:
        """Messages processed per outbound LLM request."""
        return (self.total_messages / self.llm_requests_consumed) if self.llm_requests_consumed > 0 else float("inf")

    def get_confidence_histogram(self, num_bins: int = 5) -> Dict[str, int]:
        """Generates a binned histogram of confidence scores."""
        bins = {
            "0.0 - 0.2": 0,
            "0.2 - 0.4": 0,
            "0.4 - 0.6": 0,
            "0.6 - 0.8": 0,
            "0.8 - 1.0": 0,
        }
        for score in self.confidence_scores:
            if score < 0.2:
                bins["0.0 - 0.2"] += 1
            elif score < 0.4:
                bins["0.2 - 0.4"] += 1
            elif score < 0.6:
                bins["0.4 - 0.6"] += 1
            elif score < 0.8:
                bins["0.6 - 0.8"] += 1
            else:
                bins["0.8 - 1.0"] += 1
        return bins


class ExtractionPipeline:
    """Coordinates the two-pass extraction flow across database, regex, and Gemini LLM."""

    def __init__(
        self,
        db: Database,
        gemini_client: Optional[GeminiBatchExtractor] = None,
        batch_size: int = 20,
        prompt_version: str = "v1",
    ):
        self.db = db
        self.gemini_client = gemini_client or GeminiBatchExtractor()
        self.batch_size = batch_size
        self.prompt_version = prompt_version

    async def process_batch_messages(
        self,
        messages: List[RawMessage],
    ) -> Tuple[List[dict], ExtractionMetrics]:
        """Processes a list of raw messages through the two-pass architecture."""
        metrics = ExtractionMetrics(total_messages=len(messages))
        if not messages:
            return [], metrics

        final_extractions: List[dict] = []
        candidates_to_llm: List[Tuple[RawMessage, RegexExtractionResult, SanitizedMessage, str]] = []

        # ======================================================================
        # PASS 1: DETERMINISTIC REGEX PASS & LISTING FILTER
        # ======================================================================
        for msg in messages:
            raw_text = msg.raw_text or ""
            content_hash = compute_content_hash(raw_text)
            regex_res = run_regex_pass(raw_text)

            # Record telemetry
            if regex_res.has_price_token:
                metrics.with_price_count += 1
            if regex_res.has_phone_token:
                metrics.with_phone_count += 1
            if regex_res.has_price_token and regex_res.has_phone_token:
                metrics.with_both_count += 1

            # Check in-memory / content cache first
            cached_data = global_extraction_cache.get(content_hash, self.prompt_version)
            if cached_data is not None:
                metrics.cached_hits += 1
                extraction_record = dict(cached_data)
                extraction_record["raw_message_id"] = msg.id
                final_extractions.append(extraction_record)
                metrics.confidence_scores.append(extraction_record.get("confidence_score", 0.0))
                continue

            # Heuristic filter: If regex determines message is not a listing
            if not regex_res.is_potential_listing:
                metrics.filtered_non_listings += 1
                non_listing_data = {
                    "raw_message_id": msg.id,
                    "prompt_version": self.prompt_version,
                    "title_en": None,
                    "title_am": None,
                    "description_en": None,
                    "description_am": None,
                    "price_etb": regex_res.price_etb,
                    "negotiable": regex_res.negotiable,
                    "category_slug": None,
                    "condition": None,
                    "location_area": None,
                    "location_city": "Addis Ababa",
                    "phone_raw": regex_res.phone_raw,
                    "phone_normalized": regex_res.phone_normalized,
                    "confidence_score": 0.0,
                    "is_listing": False,
                }
                global_extraction_cache.put(content_hash, self.prompt_version, non_listing_data)
                final_extractions.append(non_listing_data)
                metrics.confidence_scores.append(0.0)
                continue

            # Sanitize PII before queuing for LLM batch
            sanitized = sanitize_message_pii(
                raw_text=raw_text,
                raw_message_id=msg.id or 0,
                index=len(candidates_to_llm) + 1,
            )
            candidates_to_llm.append((msg, regex_res, sanitized, content_hash))

        metrics.llm_candidate_count = len(candidates_to_llm)

        # ======================================================================
        # PASS 2: BATCHED GEMINI CALLS (20 MESSAGES PER BATCH)
        # ======================================================================
        for i in range(0, len(candidates_to_llm), self.batch_size):
            chunk = candidates_to_llm[i : i + self.batch_size]
            metrics.llm_batches_sent += 1

            # Prepare batch payload
            batch_items = []
            for item_idx, (_, regex_res, sanitized, _) in enumerate(chunk, start=1):
                batch_items.append(
                    {
                        "index": item_idx,
                        "raw_message_id": sanitized.raw_message_id,
                        "sanitized_text": sanitized.sanitized_text,
                        "price_etb": regex_res.price_etb,
                        "negotiable": regex_res.negotiable,
                    }
                )

            # Security verification before outbound request
            prompt_str = self.gemini_client.format_batch_prompt(batch_items)
            assert_zero_pii(prompt_str)

            # Invoke Gemini batch
            llm_results = await self.gemini_client.extract_batch(batch_items)
            metrics.llm_requests_consumed = self.gemini_client.total_requests_made

            # Map LLM results by returned ID
            results_by_id = {item.get("id"): item for item in llm_results if isinstance(item, dict)}

            for item_idx, (raw_m, regex_res, sanitized, c_hash) in enumerate(chunk, start=1):
                llm_item = results_by_id.get(item_idx, {})
                
                # Reattach PII
                reattached = reattach_pii(llm_item, sanitized.pii_mapping)

                # Merge deterministic regex price if model didn't return one
                price_final = reattached.get("price_etb") or regex_res.price_etb
                negotiable_final = (
                    reattached.get("negotiable")
                    if reattached.get("negotiable") is not None
                    else regex_res.negotiable
                )

                # Fallback to regex extracted phone if LLM placeholder was empty
                phone_raw_final = reattached.get("phone_raw") or regex_res.phone_raw
                phone_norm_final = reattached.get("phone_normalized") or regex_res.phone_normalized

                confidence = float(reattached.get("confidence_score") or (0.85 if reattached.get("is_listing") else 0.0))
                confidence = max(0.0, min(1.0, confidence))

                extraction_data = {
                    "raw_message_id": raw_m.id,
                    "prompt_version": self.prompt_version,
                    "title_en": reattached.get("title_en"),
                    "title_am": reattached.get("title_am"),
                    "description_en": reattached.get("description_en"),
                    "description_am": reattached.get("description_am"),
                    "price_etb": price_final,
                    "negotiable": negotiable_final,
                    "category_slug": reattached.get("category_slug"),
                    "condition": reattached.get("condition"),
                    "location_area": reattached.get("location_area"),
                    "location_city": reattached.get("location_city") or "Addis Ababa",
                    "phone_raw": phone_raw_final,
                    "phone_normalized": phone_norm_final,
                    "confidence_score": confidence,
                    "is_listing": reattached.get("is_listing", True),
                }

                global_extraction_cache.put(c_hash, self.prompt_version, extraction_data)
                final_extractions.append(extraction_data)
                metrics.confidence_scores.append(confidence)

        # ======================================================================
        # PERSISTENCE: WRITE TO EXTRACTIONS TABLE & ENQUEUE DEDUP JOBS
        # ======================================================================
        for ext in final_extractions:
            raw_msg_id = ext["raw_message_id"]
            if raw_msg_id is not None:
                # Insert extraction row
                extraction_id = await self.db.insert_extraction(ext)
                metrics.extractions_saved += 1

                # Enqueue dedup background job if it's a listing
                if ext.get("is_listing", True) and ext.get("confidence_score", 0.0) > 0.3:
                    await self.db.enqueue_job(
                        job_type="dedup",
                        payload={
                            "extraction_id": extraction_id,
                            "raw_message_id": raw_msg_id,
                            "category_slug": ext.get("category_slug"),
                            "phone_normalized": ext.get("phone_normalized"),
                            "price_etb": ext.get("price_etb"),
                        },
                    )
                    metrics.jobs_enqueued += 1

                # Mark raw message as processed
                await self.db.mark_raw_message_processed(raw_msg_id)

        return final_extractions, metrics
