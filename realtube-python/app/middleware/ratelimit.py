"""In-memory fixed-window rate limiter for FastAPI."""

import asyncio
import math
import time
from collections.abc import Callable

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp


class _Entry:
    __slots__ = ("count", "window_end")

    def __init__(self, count: int, window_end: float):
        self.count = count
        self.window_end = window_end


class RateLimiter:
    """Fixed-window rate limiter with configurable key function."""

    def __init__(self, max_requests: int, window_seconds: float, key_fn: Callable[[Request], str]):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.key_fn = key_fn
        self._entries: dict[str, _Entry] = {}
        self._lock = asyncio.Lock()

    async def check(self, request: Request) -> tuple[bool, int, int, int]:
        """Check if request is allowed.

        Returns (allowed, limit, remaining, reset_unix).
        """
        key = self.key_fn(request)
        now = time.time()

        async with self._lock:
            entry = self._entries.get(key)
            if entry is None or now >= entry.window_end:
                entry = _Entry(count=1, window_end=now + self.window_seconds)
                self._entries[key] = entry
                remaining = self.max_requests - 1
                return True, self.max_requests, remaining, int(entry.window_end)

            entry.count += 1
            remaining = self.max_requests - entry.count
            reset = int(entry.window_end)

            if remaining < 0:
                return False, self.max_requests, 0, reset

            return True, self.max_requests, remaining, reset

    def allow(self, key: str) -> bool:
        """Synchronous check for testing."""
        now = time.time()
        entry = self._entries.get(key)
        if entry is None or now >= entry.window_end:
            self._entries[key] = _Entry(count=1, window_end=now + self.window_seconds)
            return True
        entry.count += 1
        return entry.count <= self.max_requests


# --- Key functions ---

def key_by_ip(request: Request) -> str:
    host = request.client.host if request.client else "unknown"
    return f"ip:{host}"


def key_by_user_id(request: Request) -> str:
    uid = request.headers.get("X-User-ID", "")
    if uid:
        return f"user:{uid}"
    host = request.client.host if request.client else "unknown"
    return f"ip:{host}"


# --- Pre-configured limiters matching API contract §5.3 ---

def new_video_limiter() -> RateLimiter:
    return RateLimiter(max_requests=100, window_seconds=60, key_fn=key_by_ip)

def new_vote_submit_limiter() -> RateLimiter:
    return RateLimiter(max_requests=10, window_seconds=60, key_fn=key_by_user_id)

def new_vote_delete_limiter() -> RateLimiter:
    return RateLimiter(max_requests=5, window_seconds=60, key_fn=key_by_user_id)

def new_sync_limiter() -> RateLimiter:
    return RateLimiter(max_requests=2, window_seconds=60, key_fn=key_by_user_id)

def new_stats_limiter() -> RateLimiter:
    return RateLimiter(max_requests=10, window_seconds=60, key_fn=key_by_ip)

def new_export_limiter() -> RateLimiter:
    return RateLimiter(max_requests=1, window_seconds=3600, key_fn=key_by_ip)


# --- Route-based rate limiting middleware ---

# Maps (method, path_pattern) to a RateLimiter instance.
_ROUTE_LIMITERS: dict[tuple[str, str], RateLimiter] = {}


def configure_rate_limiters() -> dict[tuple[str, str], RateLimiter]:
    """Create and return route-specific rate limiters."""
    video_rl = new_video_limiter()
    return {
        ("GET", "/api/videos/{hash_prefix}"): video_rl,
        ("GET", "/api/videos"): video_rl,
        ("POST", "/api/votes"): new_vote_submit_limiter(),
        ("DELETE", "/api/votes"): new_vote_delete_limiter(),
        ("GET", "/api/channels/{channel_id}"): video_rl,
        ("GET", "/api/users/{user_id}"): video_rl,
        ("GET", "/api/stats"): new_stats_limiter(),
        ("GET", "/api/sync/delta"): new_sync_limiter(),
        ("GET", "/api/sync/full"): new_sync_limiter(),
    }


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware that applies per-route rate limits with X-RateLimit-* headers."""

    def __init__(self, app: ASGIApp, limiters: dict[tuple[str, str], RateLimiter]):
        super().__init__(app)
        self._limiters = limiters

    def _find_limiter(self, method: str, path: str) -> RateLimiter | None:
        """Match request to a rate limiter using route patterns."""
        for (m, pattern), limiter in self._limiters.items():
            if m != method:
                continue
            if _path_matches(pattern, path):
                return limiter
        return None

    async def dispatch(self, request: Request, call_next):
        limiter = self._find_limiter(request.method, request.url.path)
        if limiter is None:
            return await call_next(request)

        allowed, limit, remaining, reset = await limiter.check(request)

        if not allowed:
            retry_after = max(1, reset - int(time.time()))
            response = JSONResponse(
                status_code=429,
                content={
                    "error": {
                        "code": "RATE_LIMITED",
                        "message": f"Too many requests. Try again in {retry_after} seconds.",
                        "retryAfter": retry_after,
                    }
                },
            )
        else:
            response = await call_next(request)

        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(remaining, 0))
        response.headers["X-RateLimit-Reset"] = str(reset)
        return response


def _path_matches(pattern: str, path: str) -> bool:
    """Simple path matching: /api/videos/{hash_prefix} matches /api/videos/abc123."""
    pattern_parts = pattern.rstrip("/").split("/")
    path_parts = path.rstrip("/").split("/")
    if len(pattern_parts) != len(path_parts):
        return False
    for pp, rp in zip(pattern_parts, path_parts):
        if pp.startswith("{") and pp.endswith("}"):
            continue
        if pp != rp:
            return False
    return True
