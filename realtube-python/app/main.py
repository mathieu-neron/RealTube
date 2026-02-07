import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.db.database import create_pool

logging.basicConfig(level=settings.log_level.upper())
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    app.state.db_pool = await create_pool(settings.database_url)
    yield
    # Shutdown
    await app.state.db_pool.close()
    logger.info("database pool closed")


app = FastAPI(title="RealTube API", version="0.1.0", lifespan=lifespan)


@app.get("/health/live")
async def health_live():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=True)
