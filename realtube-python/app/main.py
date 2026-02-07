import logging

from fastapi import FastAPI

from app.config import settings

logging.basicConfig(level=settings.log_level.upper())
logger = logging.getLogger(__name__)

app = FastAPI(title="RealTube API", version="0.1.0")


@app.get("/health/live")
async def health_live():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=True)
