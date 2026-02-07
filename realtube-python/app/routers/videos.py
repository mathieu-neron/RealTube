from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from app.dependencies import get_cache, get_db
from app.services.cache_service import CacheService
from app.services import video_service

router = APIRouter(prefix="/api/videos", tags=["videos"])


@router.get("/{hash_prefix}")
async def get_by_hash_prefix(
    hash_prefix: str,
    pool: Annotated[asyncpg.Pool, Depends(get_db)],
):
    if len(hash_prefix) < 4 or len(hash_prefix) > 8:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "INVALID_PREFIX",
                    "message": "Hash prefix must be 4-8 characters",
                }
            },
        )

    try:
        videos = await video_service.lookup_by_hash_prefix(pool, hash_prefix)
    except Exception:
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Failed to lookup videos",
                }
            },
        )

    if not videos:
        return JSONResponse(
            status_code=404,
            content={
                "error": {
                    "code": "NOT_FOUND",
                    "message": "No flagged videos matching prefix",
                }
            },
        )

    return [v.model_dump(by_alias=True, exclude_none=True) for v in videos]


@router.get("")
async def get_by_video_id(
    pool: Annotated[asyncpg.Pool, Depends(get_db)],
    cache: Annotated[CacheService, Depends(get_cache)],
    videoId: Annotated[str | None, Query()] = None,
):
    if not videoId:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "MISSING_PARAM",
                    "message": "videoId query parameter is required",
                }
            },
        )

    # Cache-aside: check cache first
    cached = await cache.get_video(videoId)
    if cached is not None:
        return cached

    try:
        video = await video_service.lookup_by_video_id(pool, videoId)
    except Exception:
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Failed to lookup video",
                }
            },
        )

    if video is None:
        return JSONResponse(
            status_code=404,
            content={
                "error": {
                    "code": "NOT_FOUND",
                    "message": "Video not found",
                }
            },
        )

    result = video.model_dump(by_alias=True, exclude_none=True)
    await cache.set_video(videoId, result)
    return result
