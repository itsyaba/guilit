"""Deduplication and clustering coordinator.

Clusters raw Telegram extractions into canonical listings:
- Picks earliest post as canonical listing
- Sets lowestPriceEtb to minimum price across cluster
- Computes seenInChannels across distinct Telegram channels
- Inserts listing_sources rows for every cross-posted message
- Inserts images with computed pHash
- Generates 768-dim embeddings via text-embedding-004
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple

from ingest.db import Database
from ingest.dedup.embeddings import TextEmbedder
from ingest.dedup.matcher import DedupDecision, MatchResult, ThreeSignalMatcher
from ingest.dedup.phash import compute_phash

logger = logging.getLogger(__name__)


def generate_listing_slug(title: str, message_id: int) -> str:
    """Generates a clean URL-friendly slug from title."""
    clean = re.sub(r"[^\w\s-]", "", title.lower())
    clean = re.sub(r"[\s_-]+", "-", clean).strip("-")
    if not clean:
        clean = "item"
    return f"{clean[:60]}-{message_id}"


@dataclass
class DedupCluster:
    """Represents a deduplicated cluster of one or more Telegram posts."""

    canonical_record: dict
    sources: List[dict] = field(default_factory=list)
    embedding: Optional[List[float]] = None
    phash: Optional[str] = None
    channels: Set[int] = field(default_factory=set)

    @property
    def lowest_price_etb(self) -> Optional[int]:
        prices = [s.get("price_etb") for s in self.sources if s.get("price_etb") is not None]
        return min(prices) if prices else self.canonical_record.get("price_etb")

    @property
    def seen_in_channels_count(self) -> int:
        return max(1, len(self.channels))


@dataclass
class DedupReport:
    """Statistics for a deduplication run."""

    total_extractions_evaluated: int = 0
    canonical_clusters_formed: int = 0
    cross_channel_clusters_count: int = 0
    multi_channel_clusters: List[dict] = field(default_factory=list)
    auto_merges_count: int = 0
    borderline_flagged_count: int = 0
    max_channels_single_cluster: int = 1


class DeduplicationService:
    """Coordinates three-signal deduplication, canonical listing resolution, and DB storage."""

    def __init__(
        self,
        db: Database,
        matcher: Optional[ThreeSignalMatcher] = None,
        embedder: Optional[TextEmbedder] = None,
    ):
        self.db = db
        self.matcher = matcher or ThreeSignalMatcher()
        self.embedder = embedder or TextEmbedder()

    async def run_clustering(
        self,
        records: Optional[List[dict]] = None,
    ) -> Tuple[List[DedupCluster], DedupReport]:
        """Runs the clustering pipeline across extracted listing records."""
        if records is None:
            records = await self.db.get_extractions_with_raw_messages()

        report = DedupReport(total_extractions_evaluated=len(records))
        clusters: List[DedupCluster] = []

        if not records:
            return clusters, report

        logger.info(f"[dedup.cluster] Starting deduplication for {len(records)} extracted records...")

        # Process each record in chronological order
        for rec in records:
            # Skip invalid / low-confidence non-listings
            if rec.get("confidence_score", 0.0) < 0.3 or not rec.get("title_en"):
                continue

            # 1. Compute hero image pHash
            media_refs = rec.get("media_refs") or []
            hero_image = media_refs[0] if media_refs else None
            rec_phash = compute_phash(hero_image)

            # 2. Compute semantic embedding
            text_for_embedding = f"{rec.get('title_en', '')} {rec.get('title_am', '') or ''} {rec.get('description_en', '') or ''}".strip()
            rec_embedding = await self.embedder.embed_text(text_for_embedding)

            matched_cluster: Optional[DedupCluster] = None
            best_decision: DedupDecision = DedupDecision.DISTINCT

            # Compare against existing clusters
            for cluster in clusters:
                res: MatchResult = self.matcher.evaluate(
                    item_a=rec,
                    item_b=cluster.canonical_record,
                    embedding_a=rec_embedding,
                    embedding_b=cluster.embedding,
                    phash_a=rec_phash,
                    phash_b=cluster.phash,
                )

                if res.decision == DedupDecision.AUTO_MERGE:
                    matched_cluster = cluster
                    best_decision = DedupDecision.AUTO_MERGE
                    report.auto_merges_count += 1
                    logger.info(
                        f"[dedup.cluster] AUTO-MERGE: msg {rec.get('message_id')} into cluster '{cluster.canonical_record.get('title_en')}' | reason={res.reason}"
                    )
                    break
                elif res.decision == DedupDecision.BORDERLINE and best_decision != DedupDecision.AUTO_MERGE:
                    report.borderline_flagged_count += 1
                    logger.debug(
                        f"[dedup.cluster] BORDERLINE: msg {rec.get('message_id')} vs cluster '{cluster.canonical_record.get('title_en')}' | reason={res.reason}"
                    )

            if matched_cluster is not None:
                # Add source to existing cluster
                matched_cluster.sources.append(rec)
                ch_id = rec.get("channel_id")
                if ch_id:
                    matched_cluster.channels.add(ch_id)
            else:
                # Create a new canonical cluster
                new_cluster = DedupCluster(
                    canonical_record=rec,
                    sources=[rec],
                    embedding=rec_embedding,
                    phash=rec_phash,
                    channels={rec.get("channel_id")} if rec.get("channel_id") else set(),
                )
                clusters.append(new_cluster)

        report.canonical_clusters_formed = len(clusters)

        # ======================================================================
        # PERSISTENCE TO DATABASE: listings, listing_sources, images
        # ======================================================================
        for cluster in clusters:
            canon = cluster.canonical_record
            seen_channels = cluster.seen_in_channels_count
            lowest_price = cluster.lowest_price_etb

            if seen_channels > 1:
                report.cross_channel_clusters_count += 1
                if seen_channels > report.max_channels_single_cluster:
                    report.max_channels_single_cluster = seen_channels
                report.multi_channel_clusters.append(
                    {
                        "title": canon.get("title_en"),
                        "seen_in_channels": seen_channels,
                        "source_count": len(cluster.sources),
                        "lowest_price_etb": lowest_price,
                        "phone": canon.get("phone_normalized"),
                        "category": canon.get("category_slug"),
                    }
                )

            # Generate unique slug
            slug = generate_listing_slug(
                canon.get("title_en") or "listing",
                canon.get("raw_message_id") or canon.get("message_id") or 1,
            )

            # 1. Upsert canonical listing
            listing_payload = {
                "slug": slug,
                "title_en": canon.get("title_en"),
                "title_am": canon.get("title_am"),
                "description_en": canon.get("description_en"),
                "description_am": canon.get("description_am"),
                "price_etb": canon.get("price_etb"),
                "lowest_price_etb": lowest_price,
                "negotiable": bool(canon.get("negotiable", False)),
                "category_slug": canon.get("category_slug"),
                "condition": canon.get("condition") or "lightly_used",
                "location_area": canon.get("location_area"),
                "location_city": canon.get("location_city") or "Addis Ababa",
                "extraction_confidence": canon.get("confidence_score", 0.85),
                "seen_in_channels": seen_channels,
                "embedding": cluster.embedding,
                "posted_at": canon.get("posted_at") or datetime.now(timezone.utc),
            }
            listing_id = await self.db.upsert_canonical_listing(listing_payload)

            # 2. Insert all listing_sources rows
            for src in cluster.sources:
                raw_id = src.get("raw_message_id")
                if raw_id:
                    await self.db.upsert_listing_source(
                        listing_id=listing_id,
                        raw_message_id=raw_id,
                        price_etb=src.get("price_etb"),
                    )

            # 3. Insert images with pHash
            for i, src in enumerate(cluster.sources):
                media_refs = src.get("media_refs") or []
                for s_idx, m_ref in enumerate(media_refs):
                    if m_ref:
                        img_phash = cluster.phash if s_idx == 0 and i == 0 else compute_phash(m_ref)
                        await self.db.upsert_listing_image(
                            listing_id=listing_id,
                            r2_key=str(m_ref),
                            phash=img_phash,
                            sort_order=s_idx,
                        )

        logger.info(
            f"[dedup.cluster] Completed | total={report.total_extractions_evaluated} clusters={report.canonical_clusters_formed} cross_channel={report.cross_channel_clusters_count}"
        )
        return clusters, report
