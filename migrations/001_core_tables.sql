-- Migration 001: Core Tables (videos, video_categories, votes)
-- RealTube - Crowdsourced AI video flagging

BEGIN;

-- ============================================================
-- VIDEOS TABLE
-- ============================================================

CREATE TABLE videos (
    video_id        VARCHAR(16) PRIMARY KEY,
    channel_id      VARCHAR(32),
    title           TEXT,
    score           FLOAT DEFAULT 0.0,
    total_votes     INTEGER DEFAULT 0,
    locked          BOOLEAN DEFAULT FALSE,
    hidden          BOOLEAN DEFAULT FALSE,
    shadow_hidden   BOOLEAN DEFAULT FALSE,
    video_duration  FLOAT,
    is_short        BOOLEAN DEFAULT FALSE,
    first_reported  TIMESTAMPTZ DEFAULT NOW(),
    last_updated    TIMESTAMPTZ DEFAULT NOW(),
    service         VARCHAR(16) DEFAULT 'youtube'
);

CREATE INDEX idx_videos_channel ON videos(channel_id);
CREATE INDEX idx_videos_score ON videos(score) WHERE score >= 50;
CREATE INDEX idx_videos_last_updated ON videos(last_updated);
CREATE INDEX idx_videos_hash_prefix ON videos(encode(sha256(video_id::bytea), 'hex'));

-- ============================================================
-- VIDEO CATEGORIES TABLE
-- ============================================================

CREATE TABLE video_categories (
    video_id        VARCHAR(16) REFERENCES videos(video_id) ON DELETE CASCADE,
    category        VARCHAR(20) NOT NULL,
    vote_count      INTEGER DEFAULT 0,
    weighted_score  FLOAT DEFAULT 0.0,
    PRIMARY KEY (video_id, category)
);

-- ============================================================
-- VOTES TABLE
-- ============================================================

CREATE TABLE votes (
    id              BIGSERIAL PRIMARY KEY,
    video_id        VARCHAR(16) NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,
    user_id         VARCHAR(64) NOT NULL,
    category        VARCHAR(20) NOT NULL,
    trust_weight    FLOAT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    ip_hash         VARCHAR(64),
    user_agent      VARCHAR(128),

    CONSTRAINT unique_vote_per_user UNIQUE(video_id, user_id)
);

CREATE INDEX idx_votes_video ON votes(video_id);
CREATE INDEX idx_votes_user ON votes(user_id);

COMMIT;
