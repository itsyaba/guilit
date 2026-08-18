"""Synonym expansion engine for bilingual search."""

from __future__ import annotations

import re
from typing import Dict, List, Set
from ingest.search.synonyms_data import SYNONYMS_DATA


class SynonymExpander:
    """Expands user search queries with canonical terms and cross-lingual synonyms."""

    def __init__(self, data: List[Dict[str, str]] = SYNONYMS_DATA):
        # "soffa" -> "sofa", "ሶፋ" -> "sofa", "sofa" -> "sofa"
        self.synonym_to_canonical: Dict[str, str] = {}
        # "sofa" -> {"sofa", "ሶፋ", "soffa", "couch", ...}
        self.canonical_to_synonyms: Dict[str, Set[str]] = {}

        self._build_index(data)

    def _build_index(self, data: List[Dict[str, str]]) -> None:
        for item in data:
            canon = item["canonical_term"].strip().lower()
            syn = item["synonym"].strip().lower()

            self.synonym_to_canonical[syn] = canon

            if canon not in self.canonical_to_synonyms:
                self.canonical_to_synonyms[canon] = set()
            self.canonical_to_synonyms[canon].add(syn)
            self.canonical_to_synonyms[canon].add(canon)

    def get_canonical_term(self, token: str) -> str:
        """Returns the canonical root term for a given synonym token, or token itself."""
        clean = token.strip().lower()
        return self.synonym_to_canonical.get(clean, clean)

    def expand_query(self, query: str) -> List[str]:
        """Expands a search query string into a list of synonymous search tokens.

        Guarantees:
        `sofa`, `ሶፋ`, and `soffa` all expand to the same unified token set.
        """
        if not query or not query.strip():
            return []

        tokens = re.findall(r"[\w\u1200-\u137F]+", query.lower())
        expanded_tokens: Set[str] = set(tokens)

        for token in tokens:
            canon = self.synonym_to_canonical.get(token)
            if canon and canon in self.canonical_to_synonyms:
                expanded_tokens.update(self.canonical_to_synonyms[canon])

        return sorted(list(expanded_tokens))

    def format_tsquery_string(self, query: str) -> str:
        """Formats an expanded tsquery string for PostgreSQL to_tsquery('simple', ...)."""
        tokens = self.expand_query(query)
        if not tokens:
            return ""
        formatted = []
        for t in tokens:
            words = [re.sub(r"[^\w\u1200-\u137F]", "", w) for w in t.split()]
            words = [w for w in words if w]
            if len(words) > 1:
                formatted.append(f"({' <-> '.join(words)})")
            elif len(words) == 1:
                formatted.append(words[0])
        return " | ".join(formatted) if formatted else ""



# Global singleton expander
global_synonym_expander = SynonymExpander()
