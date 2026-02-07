import asyncpg
from fastapi import Request


def get_db(request: Request) -> asyncpg.Pool:
    return request.app.state.db_pool
