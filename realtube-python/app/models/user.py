from datetime import datetime

from pydantic import BaseModel, Field

from .channel import ChannelResponse
from .video import CategoryDetail, VideoResponse


class User(BaseModel):
    """Database representation of a RealTube user."""

    user_id: str
    trust_score: float = 0.3
    accuracy_rate: float = 0.5
    total_votes: int = 0
    accurate_votes: int = 0
    first_seen: datetime
    last_active: datetime
    is_vip: bool = False
    is_shadowbanned: bool = False
    ban_reason: str | None = None
    username: str | None = None


class UserResponse(BaseModel):
    """API response for user info."""

    user_id: str = Field(serialization_alias="userId")
    trust_score: float = Field(serialization_alias="trustScore")
    total_votes: int = Field(serialization_alias="totalVotes")
    accuracy_rate: float = Field(serialization_alias="accuracyRate")
    account_age: int = Field(serialization_alias="accountAge")
    is_vip: bool = Field(serialization_alias="isVip")

    model_config = {"populate_by_name": True}


class StatsResponse(BaseModel):
    """API response for global statistics."""

    total_videos: int = Field(serialization_alias="totalVideos")
    total_channels: int = Field(serialization_alias="totalChannels")
    total_votes: int = Field(serialization_alias="totalVotes")
    total_users: int = Field(serialization_alias="totalUsers")
    active_users_24h: int = Field(serialization_alias="activeUsers24h")
    top_categories: dict[str, int] = Field(serialization_alias="topCategories")

    model_config = {"populate_by_name": True}


class SyncVideoEntry(BaseModel):
    """Video change entry in a sync response."""

    video_id: str = Field(serialization_alias="videoId")
    score: float | None = Field(default=None, serialization_alias="score")
    categories: dict[str, CategoryDetail] | None = None
    action: str

    model_config = {"populate_by_name": True}


class SyncChannelEntry(BaseModel):
    """Channel change entry in a sync response."""

    channel_id: str = Field(serialization_alias="channelId")
    score: float | None = Field(default=None, serialization_alias="score")
    action: str

    model_config = {"populate_by_name": True}


class SyncDeltaResponse(BaseModel):
    """API response for delta sync."""

    videos: list[SyncVideoEntry]
    channels: list[SyncChannelEntry]
    sync_timestamp: str = Field(serialization_alias="syncTimestamp")

    model_config = {"populate_by_name": True}


class SyncFullResponse(BaseModel):
    """API response for full cache download."""

    videos: list[VideoResponse]
    channels: list[ChannelResponse]
    generated_at: str = Field(serialization_alias="generatedAt")

    model_config = {"populate_by_name": True}
