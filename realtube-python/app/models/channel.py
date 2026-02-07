from datetime import datetime

from pydantic import BaseModel, Field


class Channel(BaseModel):
    """Database representation of a YouTube channel."""

    channel_id: str
    channel_name: str | None = None
    score: float = 0.0
    total_videos: int = 0
    flagged_videos: int = 0
    top_category: str | None = None
    locked: bool = False
    auto_flag_new: bool = False
    last_updated: datetime


class ChannelResponse(BaseModel):
    """API response for channel lookups."""

    channel_id: str = Field(serialization_alias="channelId")
    score: float
    total_videos: int = Field(serialization_alias="totalVideos")
    flagged_videos: int = Field(serialization_alias="flaggedVideos")
    top_categories: list[str] = Field(serialization_alias="topCategories")
    locked: bool
    last_updated: str = Field(serialization_alias="lastUpdated")

    model_config = {"populate_by_name": True}
