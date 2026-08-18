"""Background extraction worker consuming jobs via PostgreSQL SELECT FOR UPDATE SKIP LOCKED."""

from __future__ import annotations

import asyncio
import logging
import os
import signal
from datetime import datetime, timedelta, timezone
from typing import Optional

from ingest.config import settings
from ingest.db import Database, RawMessage
from ingest.extract.gemini_client import GeminiBatchExtractor, QuotaExhaustedError
from ingest.extract.pipeline import ExtractionPipeline

logger = logging.getLogger(__name__)


class ExtractionWorker:
    """Worker daemon executing batched extraction on queued raw messages and jobs."""

    def __init__(
        self,
        db: Optional[Database] = None,
        pipeline: Optional[ExtractionPipeline] = None,
        worker_id: Optional[str] = None,
        poll_interval: float = 3.0,
    ):
        self.db = db or Database()
        self.worker_id = worker_id or f"extract-worker-{os.getpid()}"
        self.pipeline = pipeline or ExtractionPipeline(self.db)
        self.poll_interval = poll_interval
        self._running = False

    async def start(self) -> None:
        """Starts the worker polling loop."""
        self._running = True
        await self.db.connect()
        logger.info(
            f"[extract.worker] Starting extraction worker '{self.worker_id}' | batch_size={self.pipeline.batch_size} model={settings.GEMINI_MODEL}"
        )

        while self._running:
            try:
                # 1. Fetch unprocessed messages from raw_messages
                unprocessed = await self.db.get_unprocessed_raw_messages(
                    limit=self.pipeline.batch_size * 2
                )
                if unprocessed:
                    logger.info(f"[extract.worker] Processing batch of {len(unprocessed)} unprocessed raw messages...")
                    _, metrics = await self.pipeline.process_batch_messages(unprocessed)
                    logger.info(
                        f"[extract.worker] Batch complete | saved={metrics.extractions_saved} non_listings={metrics.filtered_non_listings} cached={metrics.cached_hits} llm_reqs={metrics.llm_requests_consumed}"
                    )
                    continue

                # 2. Check for explicit 'extract' jobs in jobs table
                job = await self.db.claim_pending_job("extract", self.worker_id)
                if job:
                    await self._process_job(job)
                    continue

                # Sleep if idle
                await asyncio.sleep(self.poll_interval)

            except QuotaExhaustedError as e:
                logger.warning(
                    f"[extract.worker] Daily Gemini Quota Exhausted! Pausing extraction for {e.retry_after_seconds}s. Jobs remain queued in DB."
                )
                await asyncio.sleep(e.retry_after_seconds)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[extract.worker] Error in worker loop: {e}", exc_info=True)
                await asyncio.sleep(self.poll_interval)

    async def _process_job(self, job: dict) -> None:
        """Executes an individual extract job claimed from jobs table."""
        job_id = job["id"]
        attempts = job.get("attempts", 0) + 1
        payload = job.get("payload") or {}

        try:
            raw_msg_id = payload.get("raw_message_id")
            if raw_msg_id:
                # Process single message
                raw_messages = await self.db.get_all_raw_messages()
                matched = [m for m in raw_messages if m.id == raw_msg_id]
                if matched:
                    await self.pipeline.process_batch_messages(matched)

            await self.db.update_job_status(job_id, status="done", attempts=attempts)
            logger.info(f"[extract.worker] Job {job_id} completed successfully")

        except QuotaExhaustedError as e:
            # Leave job in pending with delayed run_after so daily-cap reset is transparent
            run_after = datetime.now(timezone.utc) + timedelta(seconds=e.retry_after_seconds)
            await self.db.update_job_status(
                job_id,
                status="pending",
                attempts=attempts,
                run_after=run_after,
            )
            logger.warning(
                f"[extract.worker] Job {job_id} delayed until {run_after.isoformat()} due to quota limits"
            )
            raise
        except Exception as e:
            # Exponential backoff on regular errors: 2^attempts minutes
            backoff_min = min(2**attempts, 60)
            run_after = datetime.now(timezone.utc) + timedelta(minutes=backoff_min)
            status = "failed" if attempts >= 5 else "pending"
            await self.db.update_job_status(
                job_id,
                status=status,
                attempts=attempts,
                run_after=run_after,
            )
            logger.error(f"[extract.worker] Job {job_id} failed on attempt {attempts}: {e}")

    async def stop(self) -> None:
        """Stops the worker gracefully."""
        self._running = False
        await self.db.close()
        logger.info(f"[extract.worker] Worker '{self.worker_id}' stopped")
