from datetime import datetime

from pydantic import BaseModel, Field


class Video(BaseModel):
    """Database representation of a flagged video."""

    video_id: str
    channel_id: str | None = None
    title: str | None = None
    score: float = 0.0
    total_votes: int = 0
    locked: bool = False
    hidden: bool = False
    shadow_hidden: bool = False
    video_duration: float | None = None
    is_short: bool = False
    first_reported: datetime
    last_updated: datetime
    service: str = "youtube"


class VideoCategory(BaseModel):
    """Per-category vote aggregates for a video."""

    video_id: str
    category: str
    vote_count: int = 0
    weighted_score: float = 0.0


class CategoryDetail(BaseModel):
    """Vote count and weighted score for a single category."""

    votes: int
    weighted_score: float = Field(serialization_alias="weightedScore")


class VideoResponse(BaseModel):
    """API response for video lookups."""

    video_id: str = Field(serialization_alias="videoId")
    score: float
    categories: dict[str, CategoryDetail]
    total_votes: int = Field(serialization_alias="totalVotes")
    locked: bool
    channel_id: str | None = Field(default=None, serialization_alias="channelId")
    channel_score: float | None = Field(default=None, serialization_alias="channelScore")
    last_updated: datetime = Field(serialization_alias="lastUpdated")

    model_config = {"populate_by_name": True}
