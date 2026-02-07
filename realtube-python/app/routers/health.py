"""Health check endpoints: liveness and readiness probes."""

import time

import asyncpg
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(tags=["health"])

_start_time: float = time.time()


@router.get("/health/live")
async def live():
    return {"status": "ok"}


@router.get("/health/ready")
async def ready(request: Request):
    checks: dict = {}
    overall_status = "healthy"

    # Database check
    pool: asyncpg.Pool | None = getattr(request.app.state, "db_pool", None)
    if pool is not None:
        checks["database"] = await _check_db(pool)
    else:
        checks["database"] = {"status": "down", "error": "no pool"}

    if checks["database"]["status"] != "up":
        overall_status = "degraded"

    # Redis check
    cache_svc = getattr(request.app.state, "cache_service", None)
    rdb = cache_svc.client if cache_svc else None
    if rdb is not None:
        checks["redis"] = await _check_redis(rdb)
    else:
        checks["redis"] = {"status": "disabled"}

    if checks["redis"].get("status") not in ("up", "disabled") and overall_status == "healthy":
        overall_status = "degraded"

    uptime_seconds = int(time.time() - _start_time)

    resp = {
        "status": overall_status,
        "checks": checks,
        "uptime_seconds": uptime_seconds,
        "version": "1.0.0",
    }

    status_code = 200 if overall_status == "healthy" else 503
    return JSONResponse(content=resp, status_code=status_code)


async def _check_db(pool: asyncpg.Pool) -> dict:
    start = time.time()
    try:
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        latency_ms = int((time.time() - start) * 1000)
        return {"status": "up", "latency_ms": latency_ms}
    except Exception as e:
        latency_ms = int((time.time() - start) * 1000)
        return {"status": "down", "latency_ms": latency_ms, "error": str(e)}


async def _check_redis(rdb) -> dict:
    start = time.time()
    try:
        await rdb.ping()
        latency_ms = int((time.time() - start) * 1000)
        return {"status": "up", "latency_ms": latency_ms}
    except Exception as e:
        latency_ms = int((time.time() - start) * 1000)
        return {"status": "down", "latency_ms": latency_ms, "error": str(e)}
