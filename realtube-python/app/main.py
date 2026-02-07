import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.db.database import create_pool
from app.middleware.ratelimit import RateLimitMiddleware, configure_rate_limiters
from app.routers import channels, export, health, stats, sync, users, videos, votes
from app.services.cache_service import create_cache_service

logging.basicConfig(level=settings.log_level.upper())
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    app.state.db_pool = await create_pool(settings.database_url)
    app.state.cache_service = await create_cache_service(settings.redis_url)
    yield
    # Shutdown
    await app.state.cache_service.close()
    logger.info("redis connection closed")
    await app.state.db_pool.close()
    logger.info("database pool closed")


app = FastAPI(title="RealTube API", version="0.1.0", lifespan=lifespan)

# Rate limiting middleware
app.add_middleware(RateLimitMiddleware, limiters=configure_rate_limiters())

app.include_router(health.router)
app.include_router(videos.router)
app.include_router(votes.router)
app.include_router(channels.router)
app.include_router(users.router)
app.include_router(stats.router)
app.include_router(sync.router)
app.include_router(export.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=True)
