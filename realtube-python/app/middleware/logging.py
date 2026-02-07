"""Structured logging middleware using structlog.

Configures structlog for JSON output and provides ASGI middleware
that logs every request with method, path, status, and duration.
Design: infrastructure-design.md section 22.

Privacy: raw IPs are hashed before logging; dynamic path segments
(user IDs, channel IDs, hash prefixes) are replaced with placeholders.
"""

import hashlib
import logging
import sys
import time

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


def configure_logging(log_level: str = "info", service: str = "realtube-python") -> None:
    """Initialize structlog with JSON rendering and level filtering."""
    level = getattr(logging, log_level.upper(), logging.INFO)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.format_exc_info,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )

    # Bind service name into the logger context
    structlog.contextvars.bind_contextvars(service=service)


def get_logger() -> structlog.stdlib.BoundLogger:
    """Get a structlog logger instance."""
    return structlog.get_logger()


def _hash_ip_for_log(ip: str) -> str:
    """Produce a short, irreversible hash prefix of an IP for log correlation."""
    return hashlib.sha256(ip.encode()).hexdigest()[:12]


# Path segments that precede a dynamic identifier to be sanitized.
_PATH_PARAM_MAP = {
    "users": ":userId",
    "channels": ":channelId",
    "videos": ":hashPrefix",
}


def _sanitize_path(path: str) -> str:
    """Replace dynamic path segments with placeholders to avoid logging PII."""
    parts = path.split("/")
    for i in range(1, len(parts)):
        prev = parts[i - 1]
        if prev in _PATH_PARAM_MAP:
            parts[i] = _PATH_PARAM_MAP[prev]
    return "/".join(parts)


class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    """ASGI middleware that logs each request as structured JSON.

    Privacy guarantees:
    - IP addresses are SHA-256 hashed (first 12 hex chars) before logging.
    - URL path segments containing user/channel/video IDs are replaced with
      placeholders (e.g. /api/users/:userId).
    - No request bodies, query parameters, or headers are logged.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.perf_counter()
        logger = structlog.get_logger()

        response = await call_next(request)

        duration_ms = round((time.perf_counter() - start) * 1000)
        status = response.status_code

        log_method = logger.info
        if status >= 500:
            log_method = logger.error
        elif status >= 400:
            log_method = logger.warning

        raw_ip = request.client.host if request.client else "unknown"

        log_method(
            "request",
            method=request.method,
            path=_sanitize_path(request.url.path),
            status=status,
            duration_ms=duration_ms,
            ip_hash=_hash_ip_for_log(raw_ip),
        )

        return response
