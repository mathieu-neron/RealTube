import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, Query

from app.dependencies import get_db
from app.middleware.validation import error_response
from app.models.user import (
    SyncChannelEntry,
    SyncDeltaResponse,
    SyncFullResponse,
    SyncVideoEntry,
)
from app.models.video import CategoryDetail, VideoResponse
from app.models.channel import ChannelResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.get("/delta")
async def delta_sync(
    pool: Annotated[asyncpg.Pool, Depends(get_db)],
    since: Annotated[str | None, Query()] = None,
):
    if not since:
        return error_response(400, "MISSING_PARAM", "since query parameter is required (RFC3339 timestamp)")

    try:
        since_dt = datetime.fromisoformat(since)
    except ValueError:
        return error_response(400, "INVALID_PARAM", "since must be a valid RFC3339 timestamp")

    # Reject timestamps too far in the future (> 1 minute)
    now = datetime.now(timezone.utc)
    if since_dt.tzinfo is None:
        since_dt = since_dt.replace(tzinfo=timezone.utc)
    if since_dt > now.replace(microsecond=0) + timedelta(minutes=1):
        return error_response(400, "INVALID_PARAM", "since must not be in the future")

    try:
        # Fetch changed videos from sync_cache
        video_rows = await pool.fetch(
            """SELECT video_id, score, categories, channel_id, action
               FROM sync_cache
               WHERE changed_at > $1
               ORDER BY changed_at ASC
               LIMIT 10000""",
            since_dt,
        )

        videos: list[SyncVideoEntry] = []
        for row in video_rows:
            entry = SyncVideoEntry(
                video_id=row["video_id"],
                score=row["score"],
                action=row["action"],
            )
            if entry.action == "update" and row["categories"]:
                try:
                    cats_raw = json.loads(row["categories"])
                    entry.categories = {
                        k: CategoryDetail(votes=v["votes"], weighted_score=v["weightedScore"])
                        for k, v in cats_raw.items()
                    }
                except (json.JSONDecodeError, KeyError, TypeError):
                    pass
            videos.append(entry)

        # Fetch changed channels
        channel_rows = await pool.fetch(
            """SELECT channel_id, score
               FROM channels
               WHERE last_updated > $1
               ORDER BY last_updated ASC
               LIMIT 10000""",
            since_dt,
        )

        channels: list[SyncChannelEntry] = [
            SyncChannelEntry(
                channel_id=row["channel_id"],
                score=row["score"],
                action="update",
            )
            for row in channel_rows
        ]

    except Exception:
        logger.exception("Failed to fetch delta sync")
        return error_response(500, "INTERNAL_ERROR", "Failed to fetch delta sync")

    resp = SyncDeltaResponse(
        videos=videos,
        channels=channels,
        sync_timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
    return resp.model_dump(by_alias=True, exclude_none=True)


@router.get("/full")
async def full_sync(
    pool: Annotated[asyncpg.Pool, Depends(get_db)],
):
    try:
        # Fetch all non-hidden videos with score > 0
        video_rows = await pool.fetch(
            """SELECT video_id, channel_id, title, score, total_votes, locked, hidden, shadow_hidden,
                      video_duration, is_short, first_reported, last_updated, service
               FROM videos
               WHERE hidden = false AND shadow_hidden = false AND score > 0
               ORDER BY last_updated DESC
               LIMIT 50000"""
        )

        video_responses: list[VideoResponse] = []
        for row in video_rows:
            video_responses.append(
                VideoResponse(
                    video_id=row["video_id"],
                    score=row["score"],
                    categories={},
                    total_votes=row["total_votes"],
                    locked=row["locked"],
                    channel_id=row["channel_id"],
                    last_updated=row["last_updated"],
                )
            )

        # Fetch all channels with score > 0
        channel_rows = await pool.fetch(
            """SELECT channel_id, score, total_videos, flagged_videos, top_category, locked, last_updated
               FROM channels
               WHERE score > 0
               ORDER BY last_updated DESC
               LIMIT 50000"""
        )

        channel_responses: list[ChannelResponse] = []
        for row in channel_rows:
            last_updated: datetime = row["last_updated"]
            if last_updated.tzinfo is None:
                last_updated = last_updated.replace(tzinfo=timezone.utc)
            top_categories = [row["top_category"]] if row["top_category"] else []
            channel_responses.append(
                ChannelResponse(
                    channel_id=row["channel_id"],
                    score=row["score"],
                    total_videos=row["total_videos"],
                    flagged_videos=row["flagged_videos"],
                    top_categories=top_categories,
                    locked=row["locked"],
                    last_updated=last_updated.strftime("%Y-%m-%dT%H:%M:%SZ"),
                )
            )

    except Exception:
        logger.exception("Failed to fetch full sync")
        return error_response(500, "INTERNAL_ERROR", "Failed to fetch full sync")

    resp = SyncFullResponse(
        videos=video_responses,
        channels=channel_responses,
        generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
    return resp.model_dump(by_alias=True, exclude_none=True)
