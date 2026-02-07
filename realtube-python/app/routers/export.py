"""Database export endpoint: serves the latest privacy-safe dump."""

import os
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, JSONResponse

router = APIRouter(prefix="/api/database", tags=["export"])

EXPORT_DIR = os.getenv("EXPORT_DIR", "/exports")


@router.get("/export")
async def export_database():
    export_path = Path(EXPORT_DIR)
    if not export_path.is_dir():
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Export directory not found",
                }
            },
        )

    # Find all .sql.gz files and pick the latest (lexicographic sort on YYYYMMDD)
    files = sorted(export_path.glob("realtube-*.sql.gz"))
    if not files:
        return JSONResponse(
            status_code=404,
            content={
                "error": {
                    "code": "NOT_FOUND",
                    "message": "No export file available yet",
                }
            },
        )

    latest = files[-1]
    return FileResponse(
        path=str(latest),
        filename=latest.name,
        media_type="application/gzip",
    )
