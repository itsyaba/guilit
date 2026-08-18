"""Three-Signal Deduplication Matcher.

Combines three distinct orthogonal signals:
1. Phone Number + Category + Price (strongest deterministic signal: same normalized phone + same category + price within 20%)
2. Image Perceptual Hash (pHash Hamming distance <= 6 on hero photos)
3. Semantic Text Embedding (text-embedding-004 cosine similarity >= 0.88)

Constraints:
- Never merge across categories, however similar the text.
- Never auto-merge on image hash alone (stock photos in electronics).
- Two different models (e.g. iPhone 13 vs iPhone 14) or distinct phones must not merge.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import List, Optional
from ingest.dedup.embeddings import cosine_similarity
from ingest.dedup.phash import hamming_distance, is_image_near_duplicate


class DedupDecision(str, Enum):
    AUTO_MERGE = "auto_merge"
    BORDERLINE = "borderline"
    DISTINCT = "distinct"


@dataclass
class MatchResult:
    decision: DedupDecision
    confidence: float
    reason: str
    phone_matched: bool = False
    image_matched: bool = False
    embedding_similarity: float = 0.0
    hamming_distance: int = 64
    price_difference_pct: Optional[float] = None


class ThreeSignalMatcher:
    """Evaluates candidate listing pairs using phone, pHash, and vector embeddings."""

    # Explicit product generation / model regex to prevent merging distinct items
    # (e.g. iPhone 13 vs iPhone 14, Galaxy S22 vs Galaxy S23, A54 vs A34)
    MODEL_TOKEN_REGEX = re.compile(
        r"\b(iphone\s*\d+|galaxy\s*[as]\d+|pixel\s*\d+|redmi\s*note\s*\d+|camon\s*\d+|m[123]|rtx\s*\d{4}|core\s*i[3579])\b",
        re.IGNORECASE,
    )

    def evaluate(
        self,
        item_a: dict,
        item_b: dict,
        embedding_a: Optional[List[float]] = None,
        embedding_b: Optional[List[float]] = None,
        phash_a: Optional[str] = None,
        phash_b: Optional[str] = None,
    ) -> MatchResult:
        """Evaluates whether item_a and item_b represent the exact same physical item."""
        # 1. HARD CONSTRAINT: Never merge across different categories
        cat_a = item_a.get("category_slug")
        cat_b = item_b.get("category_slug")
        if cat_a and cat_b and cat_a != cat_b:
            return MatchResult(
                decision=DedupDecision.DISTINCT,
                confidence=0.0,
                reason=f"cross_category_mismatch ({cat_a} != {cat_b})",
            )

        # 2. HARD CONSTRAINT: Distinct product model identifiers must NOT merge
        title_a = f"{item_a.get('title_en', '')} {item_a.get('title_am', '')}".lower()
        title_b = f"{item_b.get('title_en', '')} {item_b.get('title_am', '')}".lower()
        models_a = set(self.MODEL_TOKEN_REGEX.findall(title_a))
        models_b = set(self.MODEL_TOKEN_REGEX.findall(title_b))
        if models_a and models_b and models_a != models_b:
            return MatchResult(
                decision=DedupDecision.DISTINCT,
                confidence=0.0,
                reason=f"distinct_model_mismatch ({models_a} != {models_b})",
            )

        # 3. SIGNAL 1: Phone match & price variance
        phone_a = item_a.get("phone_normalized")
        phone_b = item_b.get("phone_normalized")
        phones_match = bool(phone_a and phone_b and phone_a == phone_b)
        phones_conflict = bool(phone_a and phone_b and phone_a != phone_b)

        price_a = item_a.get("price_etb")
        price_b = item_b.get("price_etb")
        price_diff_pct: Optional[float] = None
        price_within_20_pct = False

        if price_a and price_b:
            max_p = max(price_a, price_b)
            if max_p > 0:
                price_diff_pct = abs(price_a - price_b) / max_p
                price_within_20_pct = price_diff_pct <= 0.20

        # 4. SIGNAL 2: Image pHash similarity
        h_dist = hamming_distance(phash_a, phash_b)
        image_near_dup = h_dist <= 6

        # 5. SIGNAL 3: Semantic embedding cosine similarity
        emb_sim = 0.0
        if embedding_a and embedding_b:
            emb_sim = cosine_similarity(embedding_a, embedding_b)

        # ======================================================================
        # DECISION MATRIX
        # ======================================================================

        # RULE 1 (Gold Standard): Same Phone + Price within 20% -> AUTO-MERGE (1.0)
        if phones_match and (price_within_20_pct or (price_a is None or price_b is None)):
            return MatchResult(
                decision=DedupDecision.AUTO_MERGE,
                confidence=0.98,
                reason="phone_match_and_price_consistent",
                phone_matched=True,
                image_matched=image_near_dup,
                embedding_similarity=emb_sim,
                hamming_distance=h_dist,
                price_difference_pct=price_diff_pct,
            )

        # RULE 2: Visual Match (pHash <= 6) + High Semantic Similarity (>= 0.85) -> AUTO-MERGE (0.92)
        # Note: If phones explicitly conflict, don't auto-merge (likely different sellers of same stock item)
        if image_near_dup and emb_sim >= 0.85 and not phones_conflict:
            return MatchResult(
                decision=DedupDecision.AUTO_MERGE,
                confidence=0.92,
                reason="image_phash_and_semantic_match",
                phone_matched=phones_match,
                image_matched=True,
                embedding_similarity=emb_sim,
                hamming_distance=h_dist,
                price_difference_pct=price_diff_pct,
            )

        # RULE 3: Same Phone + Semantic Similarity >= 0.80 -> AUTO-MERGE
        if phones_match and emb_sim >= 0.80:
            return MatchResult(
                decision=DedupDecision.AUTO_MERGE,
                confidence=0.90,
                reason="phone_match_and_semantic_text_similarity",
                phone_matched=True,
                image_matched=image_near_dup,
                embedding_similarity=emb_sim,
                hamming_distance=h_dist,
                price_difference_pct=price_diff_pct,
            )

        # RULE 4 (Borderline / Moderation Queue):
        # - Phone matches but price differs > 20% (e.g. seller changed price significantly)
        # - Semantic similarity high [0.82, 0.88) without phone match
        if phones_match and price_diff_pct and price_diff_pct > 0.20:
            return MatchResult(
                decision=DedupDecision.BORDERLINE,
                confidence=0.65,
                reason="phone_matched_but_price_divergent",
                phone_matched=True,
                image_matched=image_near_dup,
                embedding_similarity=emb_sim,
                hamming_distance=h_dist,
                price_difference_pct=price_diff_pct,
            )

        if emb_sim >= 0.82 and not phones_conflict:
            return MatchResult(
                decision=DedupDecision.BORDERLINE,
                confidence=emb_sim,
                reason="high_semantic_similarity_unverified_phone",
                phone_matched=phones_match,
                image_matched=image_near_dup,
                embedding_similarity=emb_sim,
                hamming_distance=h_dist,
                price_difference_pct=price_diff_pct,
            )

        # Default: Distinct item
        return MatchResult(
            decision=DedupDecision.DISTINCT,
            confidence=emb_sim,
            reason="insufficient_similarity_signals",
            phone_matched=phones_match,
            image_matched=image_near_dup,
            embedding_similarity=emb_sim,
            hamming_distance=h_dist,
            price_difference_pct=price_diff_pct,
        )
