import asyncio
import logging

import asyncpg

logger = logging.getLogger(__name__)

MAX_RETRIES = 5
RETRY_INTERVAL = 2  # seconds


async def create_pool(database_url: str) -> asyncpg.Pool:
    # asyncpg expects postgresql:// not postgres://
    dsn = database_url.replace("postgres://", "postgresql://", 1)

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            pool = await asyncpg.create_pool(
                dsn,
                min_size=2,
                max_size=10,
                max_inactive_connection_lifetime=1800,  # 30 minutes
            )
            # Verify connectivity
            async with pool.acquire() as conn:
                await conn.execute("SELECT 1")
            logger.info("database connected")
            return pool
        except Exception as e:
            logger.warning("database connection attempt %d/%d failed: %s", attempt, MAX_RETRIES, e)
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_INTERVAL)

    raise RuntimeError(f"database connection failed after {MAX_RETRIES} attempts")
