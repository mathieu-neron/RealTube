-- ensure_user: Create user if new, update last_active if existing
-- $1 = user_id
INSERT INTO users (user_id) VALUES ($1)
ON CONFLICT (user_id) DO UPDATE SET last_active = NOW();

-- get_trust_score: Get user's current trust score
-- $1 = user_id
SELECT trust_score FROM users WHERE user_id = $1;

-- ensure_video: Create video if first report
-- $1 = video_id
INSERT INTO videos (video_id) VALUES ($1)
ON CONFLICT (video_id) DO NOTHING;

-- check_existing_vote: Check if user already voted on this video
-- $1 = video_id, $2 = user_id
SELECT category FROM votes WHERE video_id = $1 AND user_id = $2;

-- upsert_vote: Insert or update a vote
-- $1 = video_id, $2 = user_id, $3 = category, $4 = trust_weight, $5 = ip_hash, $6 = user_agent
INSERT INTO votes (video_id, user_id, category, trust_weight, ip_hash, user_agent)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (video_id, user_id) DO UPDATE
SET category = EXCLUDED.category, trust_weight = EXCLUDED.trust_weight, created_at = NOW();

-- increment_video_votes: Increment total vote count for new votes
-- $1 = video_id
UPDATE videos SET total_votes = total_votes + 1, last_updated = NOW()
WHERE video_id = $1;

-- decrement_category: Decrement old category count when changing vote
-- $1 = video_id, $2 = category
UPDATE video_categories SET vote_count = vote_count - 1
WHERE video_id = $1 AND category = $2 AND vote_count > 0;

-- upsert_category: Increment the per-category counter
-- $1 = video_id, $2 = category
INSERT INTO video_categories (video_id, category, vote_count)
VALUES ($1, $2, 1)
ON CONFLICT (video_id, category) DO UPDATE
SET vote_count = video_categories.vote_count + 1;

-- delete_vote: Remove a vote
-- $1 = video_id, $2 = user_id
DELETE FROM votes WHERE video_id = $1 AND user_id = $2;

-- decrement_video_votes: Decrement total vote count
-- $1 = video_id
UPDATE videos SET total_votes = total_votes - 1, last_updated = NOW()
WHERE video_id = $1 AND total_votes > 0;

-- get_video_score: Get current video score
-- $1 = video_id
SELECT score FROM videos WHERE video_id = $1;
