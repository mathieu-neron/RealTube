import logging
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.dependencies import get_db
from app.models.user import StatsResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["stats"])

STATS_QUERY = """
    SELECT
        (SELECT COUNT(*) FROM videos WHERE hidden = false AND shadow_hidden = false) AS total_videos,
        (SELECT COUNT(*) FROM channels) AS total_channels,
        (SELECT COUNT(*) FROM votes) AS total_votes,
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM users WHERE last_active > NOW() - INTERVAL '24 hours') AS active_users_24h
"""

CATEGORY_QUERY = """
    SELECT category, SUM(vote_count) AS total
    FROM video_categories
    GROUP BY category
    ORDER BY total DESC
"""


@router.get("/api/stats")
async def get_stats(
    pool: Annotated[asyncpg.Pool, Depends(get_db)],
):
    try:
        row = await pool.fetchrow(STATS_QUERY)
        cat_rows = await pool.fetch(CATEGORY_QUERY)
    except Exception:
        logger.exception("Failed to fetch statistics")
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Failed to fetch statistics",
                }
            },
        )

    top_categories = {r["category"]: int(r["total"]) for r in cat_rows}

    resp = StatsResponse(
        total_videos=row["total_videos"],
        total_channels=row["total_channels"],
        total_votes=row["total_votes"],
        total_users=row["total_users"],
        active_users_24h=row["active_users_24h"],
        top_categories=top_categories,
    )

    return resp.model_dump(by_alias=True)
