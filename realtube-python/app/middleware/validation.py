"""Input validation utilities matching database schema constraints."""

import re

from fastapi.responses import JSONResponse

# Field length limits matching database schema constraints.
MAX_VIDEO_ID_LEN = 16  # videos.video_id VARCHAR(16)
MAX_CHANNEL_ID_LEN = 32  # channels.channel_id VARCHAR(32)
MAX_USER_ID_LEN = 64  # users.user_id VARCHAR(64)
MAX_USER_AGENT_LEN = 128  # votes.user_agent VARCHAR(128)
MIN_HASH_PREFIX = 4
MAX_HASH_PREFIX = 8

# Compiled regex patterns.
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")
HEX_RE = re.compile(r"^[0-9a-f]+$")
CHANNEL_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")
USER_ID_RE = re.compile(r"^[0-9a-f]+$")


def error_response(status_code: int, code: str, message: str) -> JSONResponse:
    """Return a standard API error response."""
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


def validate_video_id(video_id: str) -> tuple[str, str | None]:
    """Validate a video ID. Returns (cleaned_id, error_message)."""
    video_id = video_id.strip() if video_id else ""
    if not video_id:
        return "", "videoId is required"
    if len(video_id) > MAX_VIDEO_ID_LEN:
        return "", "videoId must be at most 16 characters"
    if not VIDEO_ID_RE.match(video_id):
        return "", "videoId contains invalid characters"
    return video_id, None


def validate_hash_prefix(prefix: str) -> tuple[str, str | None]:
    """Validate a hash prefix. Returns (cleaned_prefix, error_message)."""
    prefix = prefix.strip().lower() if prefix else ""
    if len(prefix) < MIN_HASH_PREFIX or len(prefix) > MAX_HASH_PREFIX:
        return "", "Hash prefix must be 4-8 characters"
    if not HEX_RE.match(prefix):
        return "", "Hash prefix must be hexadecimal"
    return prefix, None


def validate_channel_id(channel_id: str) -> tuple[str, str | None]:
    """Validate a channel ID. Returns (cleaned_id, error_message)."""
    channel_id = channel_id.strip() if channel_id else ""
    if not channel_id:
        return "", "channelId is required"
    if len(channel_id) > MAX_CHANNEL_ID_LEN:
        return "", "channelId must be at most 32 characters"
    if not CHANNEL_ID_RE.match(channel_id):
        return "", "channelId contains invalid characters"
    return channel_id, None


def validate_user_id(user_id: str) -> tuple[str, str | None]:
    """Validate a user ID (hex hash). Returns (cleaned_id, error_message)."""
    user_id = user_id.strip().lower() if user_id else ""
    if not user_id:
        return "", "userId is required"
    if len(user_id) > MAX_USER_ID_LEN:
        return "", "userId must be at most 64 characters"
    if not USER_ID_RE.match(user_id):
        return "", "userId must be a hexadecimal hash"
    return user_id, None


def sanitize_user_agent(user_agent: str | None) -> str | None:
    """Trim and truncate user agent to DB limits."""
    if user_agent is None:
        return None
    user_agent = user_agent.strip()
    if len(user_agent) > MAX_USER_AGENT_LEN:
        user_agent = user_agent[:MAX_USER_AGENT_LEN]
    return user_agent or None
