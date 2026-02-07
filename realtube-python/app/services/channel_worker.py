"""Channel auto-flag background worker.

Runs every 15 minutes to recalculate channel scores and set auto_flag_new
when thresholds are met (trust-system-design.md §10).
"""

import asyncio
import logging
import time

import asyncpg

logger = logging.getLogger(__name__)

# Auto-flag thresholds (§10)
AUTO_FLAG_SCORE_THRESHOLD = 80
AUTO_FLAG_MIN_FLAGGED = 20
PRELIMINARY_SCORE = 60


async def recalculate_channel(
    pool: asyncpg.Pool, channel_id: str
) -> tuple[bool, int]:
    """Recalculate a single channel's score and auto-flag status.

    Returns (was_auto_flagged, preliminary_count).
    """
    # Compute channel stats from its videos
    row = await pool.fetchrow(
        """
        SELECT
            COUNT(*) FILTER (WHERE score >= 50)          AS flagged_videos,
            COUNT(*) FILTER (WHERE total_votes > 0)      AS total_tracked_videos,
            COALESCE(AVG(score) FILTER (WHERE score >= 50), 0) AS avg_flagged_score
        FROM videos
        WHERE channel_id = $1
        """,
        channel_id,
    )
    flagged = row["flagged_videos"]
    tracked = row["total_tracked_videos"]
    avg_flagged_score = row["avg_flagged_score"]

    # Ensure channel exists
    await pool.execute(
        "INSERT INTO channels (channel_id) VALUES ($1) ON CONFLICT (channel_id) DO NOTHING",
        channel_id,
    )

    # Compute channel score
    channel_score = 0.0
    if tracked >= 3:
        channel_score = (flagged / tracked) * avg_flagged_score
        channel_score = round(channel_score * 100) / 100

    # Check if channel is locked
    locked = await pool.fetchval(
        "SELECT locked FROM channels WHERE channel_id = $1", channel_id
    )

    # Determine auto_flag_new status (§10)
    should_auto_flag = (
        channel_score >= AUTO_FLAG_SCORE_THRESHOLD
        and flagged >= AUTO_FLAG_MIN_FLAGGED
        and not locked
    )

    # Update channel record
    await pool.execute(
        """
        UPDATE channels
        SET score = $1, flagged_videos = $2, total_videos = $3,
            auto_flag_new = $4, last_updated = NOW()
        WHERE channel_id = $5
        """,
        channel_score,
        flagged,
        tracked,
        should_auto_flag,
        channel_id,
    )

    # Apply preliminary score to new videos from auto-flagged channels
    preliminary_count = 0
    if should_auto_flag:
        result = await pool.execute(
            """
            UPDATE videos
            SET score = $1, last_updated = NOW()
            WHERE channel_id = $2 AND total_votes = 0 AND score = 0
            """,
            float(PRELIMINARY_SCORE),
            channel_id,
        )
        # asyncpg returns 'UPDATE N'
        preliminary_count = int(result.split()[-1])

    return should_auto_flag, preliminary_count


async def tick(pool: asyncpg.Pool) -> None:
    """Run one cycle: recalculate all channel scores."""
    start = time.time()

    # Get all distinct channel IDs that have at least one video with votes
    rows = await pool.fetch(
        """
        SELECT DISTINCT channel_id
        FROM videos
        WHERE channel_id IS NOT NULL AND total_votes > 0
        """
    )

    updated = 0
    auto_flagged = 0
    preliminary = 0

    for row in rows:
        channel_id = row["channel_id"]
        try:
            was_flagged, prelim_count = await recalculate_channel(pool, channel_id)
            updated += 1
            if was_flagged:
                auto_flagged += 1
            preliminary += prelim_count
        except Exception:
            logger.exception("channel-worker: error recalculating %s", channel_id)

    elapsed = time.time() - start
    logger.info(
        "channel-worker: tick complete — %d channels updated, %d auto-flagged, "
        "%d preliminary scores set (%.0fms)",
        updated,
        auto_flagged,
        preliminary,
        elapsed * 1000,
    )


async def run(pool: asyncpg.Pool, interval_seconds: int = 900) -> None:
    """Run the channel worker loop forever.

    Args:
        pool: Database connection pool.
        interval_seconds: Seconds between ticks (default 900 = 15 minutes).
    """
    logger.info("channel-worker: starting (interval=%ds)", interval_seconds)

    # Run once immediately on startup
    try:
        await tick(pool)
    except Exception:
        logger.exception("channel-worker: error on initial tick")

    while True:
        try:
            await asyncio.sleep(interval_seconds)
            await tick(pool)
        except asyncio.CancelledError:
            logger.info("channel-worker: stopping (cancelled)")
            return
        except Exception:
            logger.exception("channel-worker: error during tick")
