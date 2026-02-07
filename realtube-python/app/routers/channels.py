import logging
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.dependencies import get_db
from app.services import channel_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/channels", tags=["channels"])


@router.get("/{channel_id}")
async def get_by_channel_id(
    channel_id: str,
    pool: Annotated[asyncpg.Pool, Depends(get_db)],
):
    try:
        resp = await channel_service.lookup(pool, channel_id)
    except Exception:
        logger.exception("Failed to lookup channel")
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Failed to lookup channel",
                }
            },
        )

    if resp is None:
        return JSONResponse(
            status_code=404,
            content={
                "error": {
                    "code": "NOT_FOUND",
                    "message": "Channel not found",
                }
            },
        )

    return resp.model_dump(by_alias=True)
