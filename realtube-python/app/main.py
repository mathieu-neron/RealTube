import asyncio
import re
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.database import create_pool
from app.middleware.logging import StructuredLoggingMiddleware, configure_logging
from app.middleware.ratelimit import RateLimitMiddleware, configure_rate_limiters
from app.routers import channels, export, health, metrics, stats, sync, users, videos, votes
from app.services.cache_service import create_cache_service
from app.services import channel_worker, score_worker

# Initialize structured logging (must be before any logger usage)
configure_logging(log_level=settings.log_level, service="realtube-python")
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    app.state.db_pool = await create_pool(settings.database_url)
    app.state.cache_service = await create_cache_service(settings.redis_url)

    # Start background workers
    channel_task = asyncio.create_task(channel_worker.run(app.state.db_pool))
    score_task = asyncio.create_task(
        score_worker.run(app.state.db_pool, app.state.cache_service)
    )

    yield

    # Shutdown
    score_task.cancel()
    channel_task.cancel()
    try:
        await score_task
    except asyncio.CancelledError:
        pass
    try:
        await channel_task
    except asyncio.CancelledError:
        pass

    await app.state.cache_service.close()
    logger.info("redis connection closed")
    await app.state.db_pool.close()
    logger.info("database pool closed")


app = FastAPI(title="RealTube API", version="0.1.0", lifespan=lifespan)

# Middleware stack (order matters — last added is outermost)
# Parse CORS origins: exact origins go to allow_origins, wildcard patterns
# (e.g. "chrome-extension://*", "http://localhost:*") become a regex.
_cors_exact: list[str] = []
_cors_patterns: list[str] = []
for _o in settings.cors_origins.split(","):
    _o = _o.strip()
    if not _o:
        continue
    if _o.endswith("*"):
        _cors_patterns.append(re.escape(_o.removesuffix("*")) + ".*")
    else:
        _cors_exact.append(_o)

_cors_regex = "|".join(_cors_patterns) if _cors_patterns else None
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_exact if _cors_exact else (["*"] if settings.cors_origins == "*" else []),
    allow_origin_regex=_cors_regex,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Origin", "Content-Type", "Accept", "X-User-ID"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    max_age=86400,
)
app.add_middleware(RateLimitMiddleware, limiters=configure_rate_limiters())
app.add_middleware(StructuredLoggingMiddleware)
app.add_middleware(metrics.PrometheusMiddleware)

# Warn if wildcard CORS is used in production
if settings.environment == "production" and settings.cors_origins == "*":
    logger.warning("CORS_ORIGINS is set to '*' in production — this allows any website to make API requests")

app.include_router(health.router)
app.include_router(videos.router)
app.include_router(votes.router)
app.include_router(channels.router)
app.include_router(users.router)
app.include_router(stats.router)
app.include_router(sync.router)
app.include_router(export.router)
app.include_router(metrics.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=(settings.environment == "development"),
    )
