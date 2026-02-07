import logging
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, Request

from app.dependencies import get_cache, get_db
from app.middleware.validation import (
    error_response,
    sanitize_user_agent,
    validate_user_id,
    validate_video_id,
)
from app.models.vote import VoteDeleteRequest, VoteRequest
from app.services.cache_service import CacheService
from app.services.vote_service import VALID_CATEGORIES, delete_vote, submit_vote

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/votes", tags=["votes"])


@router.post("")
async def submit(
    request: Request,
    pool: Annotated[asyncpg.Pool, Depends(get_db)],
    cache: Annotated[CacheService, Depends(get_cache)],
):
    try:
        body = await request.json()
    except Exception:
        return error_response(400, "INVALID_BODY", "Invalid request body")

    try:
        req = VoteRequest.model_validate(body)
    except Exception:
        return error_response(400, "INVALID_BODY", "Invalid request body")

    # Validate videoId
    video_id, err = validate_video_id(req.video_id)
    if err:
        return error_response(400, "INVALID_FIELD", err)

    # Validate userId
    user_id, err = validate_user_id(req.user_id)
    if err:
        return error_response(400, "INVALID_FIELD", err)

    # Validate category
    if not req.category:
        return error_response(400, "MISSING_FIELDS", "videoId, userId, and category are required")

    if req.category not in VALID_CATEGORIES:
        return error_response(
            400,
            "INVALID_CATEGORY",
            "Invalid category. Must be one of: fully_ai, ai_voiceover, ai_visuals, ai_thumbnails, ai_assisted",
        )

    # Sanitize optional userAgent
    user_agent = sanitize_user_agent(req.user_agent)

    # Extract IP for abuse tracking
    ip_hash = request.client.host if request.client else ""

    try:
        resp = await submit_vote(pool, video_id, user_id, req.category, ip_hash, user_agent)
    except Exception:
        logger.exception("Failed to submit vote")
        return error_response(500, "INTERNAL_ERROR", "Failed to submit vote")

    # Invalidate caches after successful vote
    await cache.invalidate_video(video_id)

    return resp.model_dump(by_alias=True)


@router.delete("")
async def delete(
    request: Request,
    pool: Annotated[asyncpg.Pool, Depends(get_db)],
    cache: Annotated[CacheService, Depends(get_cache)],
):
    try:
        body = await request.json()
    except Exception:
        return error_response(400, "INVALID_BODY", "Invalid request body")

    try:
        req = VoteDeleteRequest.model_validate(body)
    except Exception:
        return error_response(400, "INVALID_BODY", "Invalid request body")

    # Validate videoId
    video_id, err = validate_video_id(req.video_id)
    if err:
        return error_response(400, "INVALID_FIELD", err)

    # Validate userId
    user_id, err = validate_user_id(req.user_id)
    if err:
        return error_response(400, "INVALID_FIELD", err)

    try:
        await delete_vote(pool, video_id, user_id)
    except LookupError:
        return error_response(404, "NOT_FOUND", "Vote not found")
    except Exception:
        logger.exception("Failed to delete vote")
        return error_response(500, "INTERNAL_ERROR", "Failed to delete vote")

    # Invalidate caches after successful vote delete
    await cache.invalidate_video(video_id)

    return {"success": True}
