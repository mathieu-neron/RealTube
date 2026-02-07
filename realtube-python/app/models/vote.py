from datetime import datetime

from pydantic import BaseModel, Field


class Vote(BaseModel):
    """Database representation of an individual vote."""

    id: int
    video_id: str
    user_id: str
    category: str
    trust_weight: float
    created_at: datetime
    ip_hash: str | None = None
    user_agent: str | None = None


class VoteRequest(BaseModel):
    """API request body for submitting a vote."""

    video_id: str = Field(alias="videoId")
    category: str
    user_id: str = Field(alias="userId")
    user_agent: str | None = Field(default=None, alias="userAgent")

    model_config = {"populate_by_name": True}


class VoteDeleteRequest(BaseModel):
    """API request body for removing a vote."""

    video_id: str = Field(alias="videoId")
    user_id: str = Field(alias="userId")

    model_config = {"populate_by_name": True}


class VoteResponse(BaseModel):
    """API response after submitting a vote."""

    success: bool
    new_score: float = Field(serialization_alias="newScore")
    user_trust: float = Field(serialization_alias="userTrust")

    model_config = {"populate_by_name": True}
