import logging
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends

from app.dependencies import get_cache, get_db
from app.middleware.validation import error_response, validate_channel_id
from app.services.cache_service import CacheService
from app.services import channel_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/channels", tags=["channels"])


@router.get("/{channel_id}")
async def get_by_channel_id(
    channel_id: str,
    pool: Annotated[asyncpg.Pool, Depends(get_db)],
    cache: Annotated[CacheService, Depends(get_cache)],
):
    channel_id, err = validate_channel_id(channel_id)
    if err:
        return error_response(400, "INVALID_FIELD", err)

    # Cache-aside: check cache first
    cached = await cache.get_channel(channel_id)
    if cached is not None:
        return cached

    try:
        resp = await channel_service.lookup(pool, channel_id)
    except Exception:
        logger.exception("Failed to lookup channel")
        return error_response(500, "INTERNAL_ERROR", "Failed to lookup channel")

    if resp is None:
        return error_response(404, "NOT_FOUND", "Channel not found")

    result = resp.model_dump(by_alias=True)
    await cache.set_channel(channel_id, result)
    return result
