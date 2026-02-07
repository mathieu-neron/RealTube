from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, Query

from app.dependencies import get_cache, get_db
from app.middleware.validation import (
    error_response,
    validate_hash_prefix,
    validate_video_id,
)
from app.services.cache_service import CacheService
from app.services import video_service

router = APIRouter(prefix="/api/videos", tags=["videos"])


@router.get("/{hash_prefix}")
async def get_by_hash_prefix(
    hash_prefix: str,
    pool: Annotated[asyncpg.Pool, Depends(get_db)],
):
    prefix, err = validate_hash_prefix(hash_prefix)
    if err:
        return error_response(400, "INVALID_PREFIX", err)

    try:
        videos = await video_service.lookup_by_hash_prefix(pool, prefix)
    except Exception:
        return error_response(500, "INTERNAL_ERROR", "Failed to lookup videos")

    if not videos:
        return error_response(404, "NOT_FOUND", "No flagged videos matching prefix")

    return [v.model_dump(by_alias=True, exclude_none=True) for v in videos]


@router.get("")
async def get_by_video_id(
    pool: Annotated[asyncpg.Pool, Depends(get_db)],
    cache: Annotated[CacheService, Depends(get_cache)],
    videoId: Annotated[str | None, Query()] = None,
):
    video_id, err = validate_video_id(videoId or "")
    if err:
        return error_response(400, "INVALID_FIELD", err)

    # Cache-aside: check cache first
    cached = await cache.get_video(video_id)
    if cached is not None:
        return cached

    try:
        video = await video_service.lookup_by_video_id(pool, video_id)
    except Exception:
        return error_response(500, "INTERNAL_ERROR", "Failed to lookup video")

    if video is None:
        return error_response(404, "NOT_FOUND", "Video not found")

    result = video.model_dump(by_alias=True, exclude_none=True)
    await cache.set_video(video_id, result)
    return result
