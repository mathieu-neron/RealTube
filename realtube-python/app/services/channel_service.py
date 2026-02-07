"""Channel lookup and score aggregation service."""

import json
import logging
import math
from datetime import datetime, timezone

import asyncpg

from app.models.channel import ChannelResponse

logger = logging.getLogger(__name__)

FIND_BY_CHANNEL_ID = """
    SELECT channel_id, channel_name, score, total_videos, flagged_videos,
           top_category, locked, auto_flag_new, last_updated
    FROM channels
    WHERE channel_id = $1
"""

GET_TOP_CATEGORIES = """
    SELECT vc.category
    FROM video_categories vc
    JOIN videos v ON v.video_id = vc.video_id
    WHERE v.channel_id = $1
    GROUP BY vc.category
    ORDER BY SUM(vc.weighted_score) DESC
"""

COMPUTE_CHANNEL_SCORE_QUERY = """
    SELECT
        COUNT(*) FILTER (WHERE score >= 50)          AS flagged_videos,
        COUNT(*) FILTER (WHERE total_votes > 0)      AS total_tracked_videos,
        COALESCE(AVG(score) FILTER (WHERE score >= 50), 0) AS avg_flagged_score
    FROM videos
    WHERE channel_id = $1
"""

UPDATE_CHANNEL_SCORE = """
    UPDATE channels
    SET score = $1, flagged_videos = $2, total_videos = $3, last_updated = NOW()
    WHERE channel_id = $4
"""


def compute_channel_score_pure(
    flagged: int, tracked: int, avg_flagged_score: float
) -> float:
    """Pure-logic helper for unit testing."""
    if tracked < 3:
        return 0.0
    score = (flagged / tracked) * avg_flagged_score
    return round(score * 100) / 100


async def lookup(pool: asyncpg.Pool, channel_id: str) -> ChannelResponse | None:
    """Fetch channel by ID with top categories."""
    row = await pool.fetchrow(FIND_BY_CHANNEL_ID, channel_id)
    if row is None:
        return None

    cat_rows = await pool.fetch(GET_TOP_CATEGORIES, channel_id)
    top_categories = [r["category"] for r in cat_rows] if cat_rows else []

    last_updated: datetime = row["last_updated"]
    if last_updated.tzinfo is None:
        last_updated = last_updated.replace(tzinfo=timezone.utc)

    return ChannelResponse(
        channel_id=row["channel_id"],
        score=row["score"],
        total_videos=row["total_videos"],
        flagged_videos=row["flagged_videos"],
        top_categories=top_categories,
        locked=row["locked"],
        last_updated=last_updated.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )


async def recalculate_score(pool: asyncpg.Pool, channel_id: str) -> None:
    """Recompute channel score from its videos."""
    row = await pool.fetchrow(COMPUTE_CHANNEL_SCORE_QUERY, channel_id)
    flagged = row["flagged_videos"]
    tracked = row["total_tracked_videos"]
    avg_flagged = row["avg_flagged_score"]

    score = compute_channel_score_pure(flagged, tracked, avg_flagged)
    await pool.execute(UPDATE_CHANNEL_SCORE, score, flagged, tracked, channel_id)
