-- find_by_hash_prefix: Returns all non-hidden videos whose SHA256 hash starts with the given prefix.
-- $1 = hash prefix (4-8 chars)
SELECT video_id, channel_id, title, score, total_votes, locked, hidden, shadow_hidden,
       video_duration, is_short, first_reported, last_updated, service
FROM videos
WHERE encode(sha256(video_id::bytea), 'hex') LIKE $1 || '%'
  AND hidden = false AND shadow_hidden = false;

-- find_by_video_id: Returns a single video by exact ID, excluding hidden ones.
-- $1 = video_id
SELECT video_id, channel_id, title, score, total_votes, locked, hidden, shadow_hidden,
       video_duration, is_short, first_reported, last_updated, service
FROM videos
WHERE video_id = $1
  AND hidden = false AND shadow_hidden = false;

-- get_categories: Returns all category vote aggregates for a given video.
-- $1 = video_id
SELECT video_id, category, vote_count, weighted_score
FROM video_categories
WHERE video_id = $1;
