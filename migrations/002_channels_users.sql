-- Migration 002: Channels & Users (channels, users, vip_actions, ip_hashes)
-- RealTube - Crowdsourced AI video flagging
-- Depends on: 001_core_tables.sql

BEGIN;

-- ============================================================
-- CHANNELS TABLE
-- ============================================================

CREATE TABLE channels (
    channel_id      VARCHAR(32) PRIMARY KEY,
    channel_name    TEXT,
    score           FLOAT DEFAULT 0.0,
    total_videos    INTEGER DEFAULT 0,
    flagged_videos  INTEGER DEFAULT 0,
    top_category    VARCHAR(20),
    locked          BOOLEAN DEFAULT FALSE,
    auto_flag_new   BOOLEAN DEFAULT FALSE,
    last_updated    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USERS TABLE
-- ============================================================

CREATE TABLE users (
    user_id         VARCHAR(64) PRIMARY KEY,
    trust_score     FLOAT DEFAULT 0.3,
    accuracy_rate   FLOAT DEFAULT 0.5,
    total_votes     INTEGER DEFAULT 0,
    accurate_votes  INTEGER DEFAULT 0,
    first_seen      TIMESTAMPTZ DEFAULT NOW(),
    last_active     TIMESTAMPTZ DEFAULT NOW(),
    is_vip          BOOLEAN DEFAULT FALSE,
    is_shadowbanned BOOLEAN DEFAULT FALSE,
    ban_reason      TEXT,
    username        VARCHAR(64)
);

-- ============================================================
-- VIP ACTIONS TABLE
-- ============================================================

CREATE TABLE vip_actions (
    id              BIGSERIAL PRIMARY KEY,
    vip_user_id     VARCHAR(64) REFERENCES users(user_id),
    action_type     VARCHAR(32) NOT NULL,
    target_type     VARCHAR(16) NOT NULL,
    target_id       VARCHAR(64) NOT NULL,
    reason          TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- IP HASHES TABLE
-- ============================================================

CREATE TABLE ip_hashes (
    ip_hash         VARCHAR(64) PRIMARY KEY,
    user_id         VARCHAR(64),
    last_seen       TIMESTAMPTZ DEFAULT NOW(),
    vote_count_24h  INTEGER DEFAULT 0,
    rate_limited    BOOLEAN DEFAULT FALSE
);

COMMIT;
