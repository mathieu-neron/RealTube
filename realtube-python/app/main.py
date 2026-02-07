import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

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
app.add_middleware(RateLimitMiddleware, limiters=configure_rate_limiters())
app.add_middleware(StructuredLoggingMiddleware)
app.add_middleware(metrics.PrometheusMiddleware)

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

    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=True)
