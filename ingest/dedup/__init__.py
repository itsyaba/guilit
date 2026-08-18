"""Deduplication package for Gulit marketplace."""

from ingest.dedup.cluster import DedupCluster, DedupReport, DeduplicationService
from ingest.dedup.embeddings import TextEmbedder, cosine_similarity
from ingest.dedup.matcher import DedupDecision, MatchResult, ThreeSignalMatcher
from ingest.dedup.phash import compute_phash, hamming_distance, is_image_near_duplicate

__all__ = [
    "DeduplicationService",
    "DedupCluster",
    "DedupReport",
    "ThreeSignalMatcher",
    "DedupDecision",
    "MatchResult",
    "TextEmbedder",
    "cosine_similarity",
    "compute_phash",
    "hamming_distance",
    "is_image_near_duplicate",
]
