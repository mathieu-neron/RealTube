"""Database export endpoint: serves the latest privacy-safe dump."""

import os
import re
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

from app.middleware.validation import error_response

router = APIRouter(prefix="/api/database", tags=["export"])

EXPORT_DIR = os.getenv("EXPORT_DIR", "/exports")

# Only allow safe filenames (no path components)
_SAFE_FILENAME = re.compile(r"^[a-zA-Z0-9_.-]+\.sql\.gz$")


@router.get("/export")
async def export_database():
    export_path = Path(EXPORT_DIR).resolve()
    if not export_path.is_dir():
        return error_response(500, "INTERNAL_ERROR", "Export directory not found")

    # Find all .sql.gz files and pick the latest (lexicographic sort on YYYYMMDD)
    files = sorted(
        f for f in export_path.glob("realtube-*.sql.gz")
        if _SAFE_FILENAME.match(f.name)
    )
    if not files:
        return error_response(404, "NOT_FOUND", "No export file available yet")

    latest = files[-1].resolve()

    # Ensure the resolved path stays within the export directory
    if not latest.is_relative_to(export_path):
        return error_response(403, "FORBIDDEN", "Access denied")

    return FileResponse(
        path=str(latest),
        filename=latest.name,
        media_type="application/gzip",
    )
