"""Prometheus metrics endpoint and collectors.

Design: infrastructure-design.md section 22.

Metrics exposed:
  realtube_votes_total{category}                     Counter
  realtube_api_request_duration_seconds{endpoint,method,status}  Histogram
  realtube_requests_in_flight                        Gauge
  realtube_cache_hits_total                          Counter
  realtube_cache_misses_total                        Counter
  realtube_score_recalculation_duration_seconds       Histogram
  realtube_db_connection_pool_active                  Gauge (callback)
  realtube_db_connection_pool_idle                    Gauge (callback)
"""

import time
import re

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse
from prometheus_client import (
    Counter,
    Gauge,
    Histogram,
    generate_latest,
    CONTENT_TYPE_LATEST,
)
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

router = APIRouter(tags=["metrics"])

# ── Collectors ──

votes_total = Counter(
    "realtube_votes_total",
    "Total votes submitted, by category.",
    ["category"],
)

request_duration = Histogram(
    "realtube_api_request_duration_seconds",
    "HTTP request duration in seconds, by endpoint and method.",
    ["endpoint", "method", "status"],
)

requests_in_flight = Gauge(
    "realtube_requests_in_flight",
    "Number of HTTP requests currently being served.",
)

cache_hits = Counter(
    "realtube_cache_hits_total",
    "Total Redis cache hits.",
)

cache_misses = Counter(
    "realtube_cache_misses_total",
    "Total Redis cache misses.",
)

score_recalc_duration = Histogram(
    "realtube_score_recalculation_duration_seconds",
    "Duration of video score recalculations.",
)

db_pool_active = Gauge(
    "realtube_db_connection_pool_active",
    "Number of active database connections.",
)

db_pool_idle = Gauge(
    "realtube_db_connection_pool_idle",
    "Number of idle database connections.",
)

# Patterns for sanitizing dynamic path segments to avoid label cardinality explosion.
_ENDPOINT_PATTERNS = [
    (re.compile(r"^/api/videos/.+$"), "/api/videos/:hashPrefix"),
    (re.compile(r"^/api/channels/.+$"), "/api/channels/:channelId"),
    (re.compile(r"^/api/users/.+$"), "/api/users/:userId"),
]


def _sanitize_endpoint(path: str) -> str:
    for pattern, replacement in _ENDPOINT_PATTERNS:
        if pattern.match(path):
            return replacement
    return path


# ── Metrics endpoint ──


@router.get("/metrics")
async def metrics_endpoint(request: Request):
    """Serve Prometheus metrics."""
    # Update DB pool gauges from live pool stats
    pool = getattr(request.app.state, "db_pool", None)
    if pool is not None:
        db_pool_active.set(pool.get_size() - pool.get_idle_size())
        db_pool_idle.set(pool.get_idle_size())

    output = generate_latest()
    return PlainTextResponse(content=output, media_type=CONTENT_TYPE_LATEST)


# ── Middleware ──


class PrometheusMiddleware(BaseHTTPMiddleware):
    """Records request duration and in-flight count for Prometheus."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Don't instrument the /metrics endpoint itself
        if request.url.path == "/metrics":
            return await call_next(request)

        requests_in_flight.inc()
        start = time.perf_counter()

        response = await call_next(request)

        duration = time.perf_counter() - start
        endpoint = _sanitize_endpoint(request.url.path)
        request_duration.labels(
            endpoint=endpoint,
            method=request.method,
            status=str(response.status_code),
        ).observe(duration)
        requests_in_flight.dec()

        return response
