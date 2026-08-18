"""Bilingual Search Engine with pgvector semantic fallback.

Features:
1. PostgreSQL Full-Text Search on generated tsvector (simple config + unaccent)
2. Trigram similarity (pg_trgm) for fuzzy and prefix matching
3. Transliteration synonym expansion (sofa ↔ ሶፋ ↔ soffa)
4. Semantic fallback via pgvector HNSW when keyword count < 5
5. Sub-200ms latency on the full catalog
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
from ingest.db import Database
from ingest.dedup.embeddings import TextEmbedder
from ingest.search.synonyms import global_synonym_expander

logger = logging.getLogger(__name__)


@dataclass
class SearchResultItem:
    id: str
    slug: str
    title_en: str
    title_am: Optional[str]
    description_en: Optional[str]
    description_am: Optional[str]
    price_etb: Optional[int]
    lowest_price_etb: Optional[int]
    category_slug: Optional[str]
    condition: Optional[str]
    location_area: Optional[str]
    seen_in_channels: int
    score: float
    search_method: str  # "keyword_fts", "trigram_fuzzy", "synonym_expansion", "semantic_vector"


@dataclass
class SearchResponse:
    query: str
    expanded_tokens: List[str]
    total_results: int
    results: List[SearchResultItem]
    duration_ms: float
    method_used: str
    explain_plan: Optional[str] = None


class BilingualSearchEngine:
    """Postgres-native hybrid search engine combining FTS, pg_trgm, synonyms, and pgvector."""

    def __init__(
        self,
        db: Database,
        embedder: Optional[TextEmbedder] = None,
    ):
        self.db = db
        self.embedder = embedder or TextEmbedder()

    async def search(
        self,
        query: str,
        category: Optional[str] = None,
        min_price: Optional[int] = None,
        max_price: Optional[int] = None,
        limit: int = 24,
        explain: bool = False,
    ) -> SearchResponse:
        """Executes hybrid bilingual search with automatic semantic fallback."""
        start_time = time.monotonic()
        clean_q = query.strip()
        expanded_tokens = global_synonym_expander.expand_query(clean_q)

        assert self.db._pool is not None, "Database pool not initialized. Call connect() first."

        results: List[SearchResultItem] = []
        method_used = "keyword_hybrid"
        explain_plan: Optional[str] = None

        async with self.db._pool.connection() as conn:
            async with conn.cursor() as cur:
                # ==============================================================
                # PASS 1: KEYWORD SEARCH (FTS + TRIGRAM + SYNONYMS)
                # ==============================================================
                tsquery_str = global_synonym_expander.format_tsquery_string(clean_q) or clean_q

                
                # Filters
                filters = ["status = 'live'"]
                params: List[Any] = []

                if category:
                    filters.append("category_slug = %s")
                    params.append(category)
                if min_price is not None:
                    filters.append("price_etb >= %s")
                    params.append(min_price)
                if max_price is not None:
                    filters.append("price_etb <= %s")
                    params.append(max_price)

                where_clause = " AND ".join(filters)

                canonical_term = global_synonym_expander.get_canonical_term(clean_q)

                if tsquery_str:
                    sql_query = f"""
                        SELECT 
                            id,
                            slug,
                            title_en,
                            title_am,
                            description_en,
                            description_am,
                            price_etb,
                            lowest_price_etb,
                            category_slug,
                            condition,
                            location_area,
                            seen_in_channels,
                            (
                                ts_rank_cd(search_vector, to_tsquery('simple', %s)) * 4.0 +
                                similarity(unaccent(title_en), unaccent(%s)) * 1.0 +
                                similarity(coalesce(unaccent(title_am), ''), unaccent(%s)) * 1.0
                            ) AS rank_score
                        FROM listings
                        WHERE {where_clause}
                          AND (
                              search_vector @@ to_tsquery('simple', %s)
                              OR (
                                  similarity(unaccent(title_en), unaccent(%s)) > 0.35
                                  OR similarity(coalesce(unaccent(title_am), ''), unaccent(%s)) > 0.35
                              )
                          )
                        ORDER BY rank_score DESC, lowest_price_etb ASC NULLS LAST, id ASC
                        LIMIT %s;
                    """
                    full_params = [
                        tsquery_str,
                        canonical_term,
                        canonical_term,
                        *params,
                        tsquery_str,
                        canonical_term,
                        canonical_term,
                        limit,
                    ]



                    if explain:
                        await cur.execute(f"EXPLAIN ANALYZE {sql_query}", full_params)
                        plan_rows = await cur.fetchall()
                        explain_plan = "\n".join(row.get("QUERY PLAN", "") for row in plan_rows)

                    await cur.execute(sql_query, full_params)
                    rows = await cur.fetchall()

                    for row in rows:
                        results.append(
                            SearchResultItem(
                                id=str(row["id"]),
                                slug=row["slug"],
                                title_en=row["title_en"],
                                title_am=row["title_am"],
                                description_en=row["description_en"],
                                description_am=row["description_am"],
                                price_etb=row["price_etb"],
                                lowest_price_etb=row["lowest_price_etb"],
                                category_slug=row["category_slug"],
                                condition=row["condition"],
                                location_area=row["location_area"],
                                seen_in_channels=row["seen_in_channels"],
                                score=float(row.get("rank_score") or 1.0),
                                search_method="keyword_hybrid",
                            )
                        )

                # ==============================================================
                # PASS 2: SEMANTIC FALLBACK (PGVECTOR HNSW COSINE SIMILARITY)
                # ==============================================================
                # If keyword search returned under 5 results and a natural query was provided
                if len(results) < 5 and clean_q:
                    logger.info(
                        f"[search.engine] Keyword results below threshold ({len(results)} < 5). Triggering pgvector semantic fallback for '{clean_q}'..."
                    )
                    method_used = "semantic_vector_fallback" if not results else "keyword_with_semantic_fallback"
                    query_embedding = await self.embedder.embed_text(canonical_term or clean_q)
                    emb_str = f"[{','.join(str(x) for x in query_embedding)}]"


                    existing_ids = [r.id for r in results]
                    semantic_filters = list(filters)
                    semantic_params: List[Any] = [emb_str]

                    if existing_ids:
                        semantic_filters.append("id::text NOT IN (%s)" % ",".join(["%s"] * len(existing_ids)))
                        semantic_params.extend(existing_ids)
                    semantic_params.extend(params)
                    semantic_params.append(limit - len(results))

                    sem_where = " AND ".join(semantic_filters)

                    sem_sql = f"""
                        SELECT 
                            id,
                            slug,
                            title_en,
                            title_am,
                            description_en,
                            description_am,
                            price_etb,
                            lowest_price_etb,
                            category_slug,
                            condition,
                            location_area,
                            seen_in_channels,
                            (1 - (embedding <=> %s::vector)) AS cosine_sim
                        FROM listings
                        WHERE {sem_where}
                          AND embedding IS NOT NULL
                        ORDER BY embedding <=> %s::vector ASC
                        LIMIT %s;
                    """
                    sem_full_params = [emb_str, *semantic_params[1:-1], emb_str, semantic_params[-1]]

                    if explain and not explain_plan:
                        await cur.execute(f"EXPLAIN ANALYZE {sem_sql}", sem_full_params)
                        plan_rows = await cur.fetchall()
                        explain_plan = "\n".join(row.get("QUERY PLAN", "") for row in plan_rows)

                    await cur.execute(sem_sql, sem_full_params)
                    sem_rows = await cur.fetchall()

                    for row in sem_rows:
                        results.append(
                            SearchResultItem(
                                id=str(row["id"]),
                                slug=row["slug"],
                                title_en=row["title_en"],
                                title_am=row["title_am"],
                                description_en=row["description_en"],
                                description_am=row["description_am"],
                                price_etb=row["price_etb"],
                                lowest_price_etb=row["lowest_price_etb"],
                                category_slug=row["category_slug"],
                                condition=row["condition"],
                                location_area=row["location_area"],
                                seen_in_channels=row["seen_in_channels"],
                                score=float(row.get("cosine_sim") or 0.5),
                                search_method="semantic_vector",
                            )
                        )

        duration_ms = (time.monotonic() - start_time) * 1000.0

        return SearchResponse(
            query=clean_q,
            expanded_tokens=expanded_tokens,
            total_results=len(results),
            results=results,
            duration_ms=duration_ms,
            method_used=method_used,
            explain_plan=explain_plan,
        )
