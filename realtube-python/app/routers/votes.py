import logging
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.dependencies import get_db
from app.models.vote import VoteDeleteRequest, VoteRequest
from app.services.vote_service import VALID_CATEGORIES, delete_vote, submit_vote

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/votes", tags=["votes"])


@router.post("")
async def submit(
    request: Request,
    pool: Annotated[asyncpg.Pool, Depends(get_db)],
):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "INVALID_BODY",
                    "message": "Invalid request body",
                }
            },
        )

    try:
        req = VoteRequest.model_validate(body)
    except Exception:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "INVALID_BODY",
                    "message": "Invalid request body",
                }
            },
        )

    if not req.video_id or not req.user_id or not req.category:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "MISSING_FIELDS",
                    "message": "videoId, userId, and category are required",
                }
            },
        )

    if req.category not in VALID_CATEGORIES:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "INVALID_CATEGORY",
                    "message": "Invalid category. Must be one of: fully_ai, ai_voiceover, ai_visuals, ai_thumbnails, ai_assisted",
                }
            },
        )

    # Extract IP for abuse tracking
    ip_hash = request.client.host if request.client else ""

    try:
        resp = await submit_vote(
            pool, req.video_id, req.user_id, req.category, ip_hash, req.user_agent
        )
    except Exception:
        logger.exception("Failed to submit vote")
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Failed to submit vote",
                }
            },
        )

    return resp.model_dump(by_alias=True)


@router.delete("")
async def delete(
    request: Request,
    pool: Annotated[asyncpg.Pool, Depends(get_db)],
):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "INVALID_BODY",
                    "message": "Invalid request body",
                }
            },
        )

    try:
        req = VoteDeleteRequest.model_validate(body)
    except Exception:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "INVALID_BODY",
                    "message": "Invalid request body",
                }
            },
        )

    if not req.video_id or not req.user_id:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "MISSING_FIELDS",
                    "message": "videoId and userId are required",
                }
            },
        )

    try:
        await delete_vote(pool, req.video_id, req.user_id)
    except LookupError:
        return JSONResponse(
            status_code=404,
            content={
                "error": {
                    "code": "NOT_FOUND",
                    "message": "Vote not found",
                }
            },
        )
    except Exception:
        logger.exception("Failed to delete vote")
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Failed to delete vote",
                }
            },
        )

    return {"success": True}
