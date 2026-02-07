-- E2E test seed data
-- Inserts known videos, channels, users, and votes for integration testing.
-- Run AFTER migrations. Uses ON CONFLICT DO NOTHING for idempotency.

BEGIN;

-- ── Channels ──
INSERT INTO channels (channel_id, channel_name, score, total_videos, flagged_videos, top_category)
VALUES
  ('UCe2eAIchan01', 'AI Channel One', 85.0, 10, 8, 'fully_ai'),
  ('UCe2eRealChan', 'Real Channel', 0.0, 5, 0, NULL)
ON CONFLICT (channel_id) DO NOTHING;

-- ── Videos ──
-- e2eVid01: high-score AI video (should be hidden by extension logic)
INSERT INTO videos (video_id, channel_id, title, score, total_votes, locked)
VALUES
  ('e2eVid01', 'UCe2eAIchan01', 'Fully AI Generated Video', 90.0, 10, false),
  ('e2eVid02', 'UCe2eAIchan01', 'Partial AI Video', 45.0, 5, false),
  ('e2eVid03', 'UCe2eRealChan', 'Real Human Video', 0.0, 0, false)
ON CONFLICT (video_id) DO NOTHING;

-- ── Video categories ──
INSERT INTO video_categories (video_id, category, vote_count, weighted_score)
VALUES
  ('e2eVid01', 'fully_ai', 8, 85.0),
  ('e2eVid01', 'ai_voiceover', 2, 5.0),
  ('e2eVid02', 'ai_visuals', 3, 30.0),
  ('e2eVid02', 'ai_thumbnails', 2, 15.0)
ON CONFLICT (video_id, category) DO NOTHING;

-- ── Users ── (user_id must be hex-only to pass validation)
INSERT INTO users (user_id, trust_score, accuracy_rate, total_votes, accurate_votes, is_vip)
VALUES
  ('ae2e00010abc', 0.7, 0.8, 50, 40, false),
  ('ae2e00020def', 0.5, 0.6, 10, 6, false)
ON CONFLICT (user_id) DO NOTHING;

-- ── Votes ──
INSERT INTO votes (video_id, user_id, category, trust_weight, user_agent)
VALUES
  ('e2eVid01', 'ae2e00010abc', 'fully_ai', 0.7, 'e2e-test/1.0'),
  ('e2eVid01', 'ae2e00020def', 'fully_ai', 0.5, 'e2e-test/1.0')
ON CONFLICT (video_id, user_id) DO NOTHING;

-- ── Sync cache entry ── (for delta sync)
INSERT INTO sync_cache (video_id, score, categories, channel_id, action, changed_at)
VALUES
  ('e2eVid01', 90.0, '{"fully_ai": {"votes": 8, "weightedScore": 85.0}}', 'UCe2eAIchan01', 'update', NOW() - INTERVAL '5 minutes')
ON CONFLICT DO NOTHING;

COMMIT;
