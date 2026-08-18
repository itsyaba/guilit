"""Extraction caching and content hashing.

Guarantees:
1. Message text is hashed via SHA-256 (normalized whitespace).
2. If an extraction for (content_hash, prompt_version) already exists in memory/DB,
   it is immediately reused without invoking Gemini.
3. Re-running the extraction pipeline over unchanged messages consumes 0 API calls.
"""

from __future__ import annotations

import hashlib
from typing import Dict, Optional
from pydantic import BaseModel


def compute_content_hash(text: Optional[str]) -> str:
    """Computes a deterministic SHA-256 hash of normalized message text."""
    if not text:
        return hashlib.sha256(b"").hexdigest()
    normalized = " ".join(text.strip().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


class ExtractionCache:
    """In-memory and lookup cache for extractions keyed by (content_hash, prompt_version)."""

    def __init__(self):
        # (content_hash, prompt_version) -> extraction_data dict
        self._cache: Dict[str, dict] = {}
        self.hits: int = 0
        self.misses: int = 0

    def _key(self, content_hash: str, prompt_version: str) -> str:
        return f"{content_hash}:{prompt_version}"

    def get(self, content_hash: str, prompt_version: str) -> Optional[dict]:
        """Retrieves cached extraction result if present."""
        key = self._key(content_hash, prompt_version)
        result = self._cache.get(key)
        if result is not None:
            self.hits += 1
            return result
        self.misses += 1
        return None

    def put(self, content_hash: str, prompt_version: str, extraction_data: dict) -> None:
        """Stores an extraction result in the cache."""
        key = self._key(content_hash, prompt_version)
        self._cache[key] = extraction_data

    def clear(self) -> None:
        """Clears all cached extractions."""
        self._cache.clear()
        self.hits = 0
        self.misses = 0


# Global process-level cache instance
global_extraction_cache = ExtractionCache()
