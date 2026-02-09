import logging

import asyncpg

from app.models.video import CategoryDetail, Video, VideoResponse

logger = logging.getLogger(__name__)

FIND_BY_HASH_PREFIX = """
    SELECT video_id, channel_id, title, score, total_votes, locked, hidden, shadow_hidden,
           video_duration, is_short, first_reported, last_updated, service
    FROM videos
    WHERE encode(sha256(video_id::bytea), 'hex') LIKE $1 || '%'
      AND hidden = false AND shadow_hidden = false
    LIMIT 1000
"""

FIND_BY_VIDEO_ID = """
    SELECT video_id, channel_id, title, score, total_votes, locked, hidden, shadow_hidden,
           video_duration, is_short, first_reported, last_updated, service
    FROM videos
    WHERE video_id = $1
      AND hidden = false AND shadow_hidden = false
"""

GET_CATEGORIES = """
    SELECT video_id, category, vote_count, weighted_score
    FROM video_categories
    WHERE video_id = $1
"""


def _row_to_video(row: asyncpg.Record) -> Video:
    return Video(
        video_id=row["video_id"],
        channel_id=row["channel_id"],
        title=row["title"],
        score=row["score"],
        total_votes=row["total_votes"],
        locked=row["locked"],
        hidden=row["hidden"],
        shadow_hidden=row["shadow_hidden"],
        video_duration=row["video_duration"],
        is_short=row["is_short"],
        first_reported=row["first_reported"],
        last_updated=row["last_updated"],
        service=row["service"],
    )


async def _build_response(pool: asyncpg.Pool, video: Video) -> VideoResponse:
    rows = await pool.fetch(GET_CATEGORIES, video.video_id)
    categories: dict[str, CategoryDetail] = {}
    for row in rows:
        categories[row["category"]] = CategoryDetail(
            votes=row["vote_count"],
            weighted_score=row["weighted_score"],
        )
    return VideoResponse(
        video_id=video.video_id,
        score=video.score,
        categories=categories,
        total_votes=video.total_votes,
        locked=video.locked,
        channel_id=video.channel_id,
        last_updated=video.last_updated,
    )


async def lookup_by_hash_prefix(
    pool: asyncpg.Pool, prefix: str
) -> list[VideoResponse]:
    rows = await pool.fetch(FIND_BY_HASH_PREFIX, prefix)
    videos = [_row_to_video(row) for row in rows]
    return [await _build_response(pool, v) for v in videos]


async def lookup_by_video_id(
    pool: asyncpg.Pool, video_id: str
) -> VideoResponse | None:
    row = await pool.fetchrow(FIND_BY_VIDEO_ID, video_id)
    if row is None:
        return None
    video = _row_to_video(row)
    return await _build_response(pool, video)
