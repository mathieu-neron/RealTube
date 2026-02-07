"""Redis cache-aside service for video and channel lookups."""

import json
import logging
from datetime import datetime

import redis.asyncio as redis


class _DateTimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

logger = logging.getLogger(__name__)

VIDEO_CACHE_TTL = 300  # 5 minutes
CHANNEL_CACHE_TTL = 900  # 15 minutes


class CacheService:
    """Redis cache-aside layer. If client is None, all operations are no-ops."""

    def __init__(self, client: redis.Redis | None):
        self._rdb = client

    @property
    def client(self) -> redis.Redis | None:
        return self._rdb

    # --- Video cache ---

    async def get_video(self, video_id: str) -> dict | None:
        if self._rdb is None:
            return None
        try:
            data = await self._rdb.get(f"video:{video_id}")
            if data is None:
                return None
            return json.loads(data)
        except Exception:
            logger.warning("cache get_video failed for %s", video_id, exc_info=True)
            return None

    async def set_video(self, video_id: str, data: dict) -> None:
        if self._rdb is None:
            return
        try:
            await self._rdb.set(f"video:{video_id}", json.dumps(data, cls=_DateTimeEncoder), ex=VIDEO_CACHE_TTL)
        except Exception:
            logger.warning("cache set_video failed for %s", video_id, exc_info=True)

    async def invalidate_video(self, video_id: str) -> None:
        if self._rdb is None:
            return
        try:
            await self._rdb.delete(f"video:{video_id}")
        except Exception:
            logger.warning("cache invalidate_video failed for %s", video_id, exc_info=True)

    # --- Channel cache ---

    async def get_channel(self, channel_id: str) -> dict | None:
        if self._rdb is None:
            return None
        try:
            data = await self._rdb.get(f"channel:{channel_id}")
            if data is None:
                return None
            return json.loads(data)
        except Exception:
            logger.warning("cache get_channel failed for %s", channel_id, exc_info=True)
            return None

    async def set_channel(self, channel_id: str, data: dict) -> None:
        if self._rdb is None:
            return
        try:
            await self._rdb.set(f"channel:{channel_id}", json.dumps(data, cls=_DateTimeEncoder), ex=CHANNEL_CACHE_TTL)
        except Exception:
            logger.warning("cache set_channel failed for %s", channel_id, exc_info=True)

    async def invalidate_channel(self, channel_id: str) -> None:
        if self._rdb is None:
            return
        try:
            await self._rdb.delete(f"channel:{channel_id}")
        except Exception:
            logger.warning("cache invalidate_channel failed for %s", channel_id, exc_info=True)

    async def close(self) -> None:
        if self._rdb is None:
            return
        await self._rdb.aclose()


async def create_cache_service(redis_url: str) -> CacheService:
    """Create a CacheService. Returns a no-op service if connection fails."""
    if not redis_url:
        logger.info("redis: no URL configured, caching disabled")
        return CacheService(None)

    try:
        client = redis.from_url(redis_url, decode_responses=True)
        await client.ping()
        logger.info("redis: connected, caching enabled")
        return CacheService(client)
    except Exception:
        logger.warning("redis: connection failed, caching disabled", exc_info=True)
        return CacheService(None)
