-- Migration 003: Cache Tables & Triggers
-- RealTube - Crowdsourced AI video flagging
-- Depends on: 001_core_tables.sql, 002_channels_users.sql

BEGIN;

-- ============================================================
-- SYNC CACHE TABLE
-- ============================================================

CREATE TABLE sync_cache (
    id              BIGSERIAL PRIMARY KEY,
    video_id        VARCHAR(16) NOT NULL,
    score           FLOAT NOT NULL,
    categories      JSONB NOT NULL,
    channel_id      VARCHAR(32),
    action          VARCHAR(8) DEFAULT 'update',
    changed_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_cache_changed ON sync_cache(changed_at);

-- ============================================================
-- FULL CACHE BLOB TABLE
-- ============================================================

CREATE TABLE full_cache_blob (
    id              SERIAL PRIMARY KEY,
    blob_data       BYTEA NOT NULL,
    generated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VOTE CHANGE NOTIFICATION TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION notify_vote_change() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('vote_changes', NEW.video_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vote_inserted AFTER INSERT OR UPDATE ON votes
FOR EACH ROW EXECUTE FUNCTION notify_vote_change();

COMMIT;
