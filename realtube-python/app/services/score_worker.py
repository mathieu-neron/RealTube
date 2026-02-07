"""Async score recalculation worker using PostgreSQL LISTEN/NOTIFY.

Listens on the 'vote_changes' channel for video IDs, batches them over
a 5-second window, deduplicates, and recalculates once per unique video ID
(infrastructure-design.md §14).
"""

import asyncio
import logging
import time

import asyncpg

from app.services.score_service import recalculate_video_score

logger = logging.getLogger(__name__)

BATCH_WINDOW_SECONDS = 5


async def run(
    pool: asyncpg.Pool,
    cache_service,
    batch_window: float = BATCH_WINDOW_SECONDS,
) -> None:
    """Run the score worker loop forever.

    Args:
        pool: Database connection pool.
        cache_service: CacheService instance for Redis invalidation.
        batch_window: Seconds to collect notifications before flushing.
    """
    logger.info("score-worker: starting (batch window=%.0fs)", batch_window)

    while True:
        try:
            await _listen_loop(pool, cache_service, batch_window)
        except asyncio.CancelledError:
            logger.info("score-worker: stopping (cancelled)")
            return
        except Exception:
            logger.exception("score-worker: listen error, reconnecting in 5s")
            try:
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                logger.info("score-worker: stopping (cancelled)")
                return


async def _listen_loop(
    pool: asyncpg.Pool,
    cache_service,
    batch_window: float,
) -> None:
    """Acquire a dedicated connection, LISTEN, and batch notifications."""
    conn = await pool.acquire()
    try:
        pending: set[str] = set()

        def _on_notification(conn, pid, channel, payload):
            if payload:
                pending.add(payload)

        await conn.add_listener("vote_changes", _on_notification)
        logger.info("score-worker: listening on vote_changes")

        try:
            while True:
                await asyncio.sleep(batch_window)

                if not pending:
                    continue

                # Swap out the pending set
                batch = pending.copy()
                pending.clear()

                await _flush(pool, cache_service, batch)
        finally:
            await conn.remove_listener("vote_changes", _on_notification)
    finally:
        await pool.release(conn)


async def _flush(
    pool: asyncpg.Pool,
    cache_service,
    batch: set[str],
) -> None:
    """Recalculate scores for all video IDs in the batch."""
    start = time.time()
    recalculated = 0

    for video_id in batch:
        try:
            await recalculate_video_score(pool, video_id)

            # Invalidate Redis cache
            if cache_service is not None:
                try:
                    await cache_service.invalidate_video(video_id)
                except Exception:
                    logger.warning(
                        "score-worker: cache invalidate error for %s",
                        video_id,
                        exc_info=True,
                    )

            recalculated += 1
        except Exception:
            logger.exception(
                "score-worker: recalculate error for %s", video_id
            )

    elapsed = time.time() - start
    if recalculated > 0:
        logger.info(
            "score-worker: batch complete — %d videos recalculated "
            "(from %d notifications, %.0fms)",
            recalculated,
            len(batch),
            elapsed * 1000,
        )
