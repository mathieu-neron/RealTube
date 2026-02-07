import logging
import math
from datetime import datetime, timezone
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends

from app.dependencies import get_db
from app.middleware.validation import error_response, validate_user_id
from app.models.user import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/users", tags=["users"])

FIND_BY_USER_ID = """
    SELECT user_id, trust_score, accuracy_rate, total_votes, accurate_votes,
           first_seen, last_active, is_vip, is_shadowbanned, ban_reason, username
    FROM users
    WHERE user_id = $1
"""

CREATE_IF_NOT_EXISTS = """
    INSERT INTO users (user_id) VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
"""


@router.get("/{user_id}")
async def get_by_user_id(
    user_id: str,
    pool: Annotated[asyncpg.Pool, Depends(get_db)],
):
    user_id, err = validate_user_id(user_id)
    if err:
        return error_response(400, "INVALID_FIELD", err)

    try:
        row = await pool.fetchrow(FIND_BY_USER_ID, user_id)
        if row is None:
            await pool.execute(CREATE_IF_NOT_EXISTS, user_id)
            row = await pool.fetchrow(FIND_BY_USER_ID, user_id)
    except Exception:
        logger.exception("Failed to lookup user")
        return error_response(500, "INTERNAL_ERROR", "Failed to lookup user")

    if row is None:
        return error_response(500, "INTERNAL_ERROR", "Failed to create user")

    first_seen: datetime = row["first_seen"]
    if first_seen.tzinfo is None:
        first_seen = first_seen.replace(tzinfo=timezone.utc)
    account_age = int(math.floor((datetime.now(timezone.utc) - first_seen).total_seconds() / 86400))

    resp = UserResponse(
        user_id=row["user_id"],
        trust_score=row["trust_score"],
        total_votes=row["total_votes"],
        accuracy_rate=row["accuracy_rate"],
        account_age=account_age,
        is_vip=row["is_vip"],
    )

    return resp.model_dump(by_alias=True)
