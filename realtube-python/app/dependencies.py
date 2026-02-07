import asyncpg
from fastapi import Request

from app.services.cache_service import CacheService


def get_db(request: Request) -> asyncpg.Pool:
    return request.app.state.db_pool


def get_cache(request: Request) -> CacheService:
    return request.app.state.cache_service
