package repository

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type VoteRepo struct {
	pool *pgxpool.Pool
}

func NewVoteRepo(pool *pgxpool.Pool) *VoteRepo {
	return &VoteRepo{pool: pool}
}

// ValidCategories are the allowed AI category values.
var ValidCategories = map[string]bool{
	"fully_ai":      true,
	"ai_voiceover":  true,
	"ai_visuals":    true,
	"ai_thumbnails": true,
	"ai_assisted":   true,
}

// SubmitVote inserts or updates a vote using atomic SQL.
// It ensures the video and user exist, then performs the upsert.
// Returns the user's trust score at vote time.
func (r *VoteRepo) SubmitVote(ctx context.Context, videoID, userID, category, ipHash, userAgent string) (trustWeight float64, err error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	// Ensure user exists (auto-create with defaults if new)
	_, err = tx.Exec(ctx, `
		INSERT INTO users (user_id) VALUES ($1)
		ON CONFLICT (user_id) DO UPDATE SET last_active = NOW()`,
		userID)
	if err != nil {
		return 0, err
	}

	// Get user's trust score
	err = tx.QueryRow(ctx, `SELECT trust_score FROM users WHERE user_id = $1`, userID).Scan(&trustWeight)
	if err != nil {
		return 0, err
	}

	// Ensure video exists (auto-create if first report)
	_, err = tx.Exec(ctx, `
		INSERT INTO videos (video_id) VALUES ($1)
		ON CONFLICT (video_id) DO NOTHING`,
		videoID)
	if err != nil {
		return 0, err
	}

	// Check if this is a new vote or an update
	var existingCategory string
	err = tx.QueryRow(ctx, `
		SELECT category FROM votes WHERE video_id = $1 AND user_id = $2`,
		videoID, userID).Scan(&existingCategory)
	isNewVote := err == pgx.ErrNoRows
	if err != nil && !isNewVote {
		return 0, err
	}

	// Insert or update the vote
	_, err = tx.Exec(ctx, `
		INSERT INTO votes (video_id, user_id, category, trust_weight, ip_hash, user_agent)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (video_id, user_id) DO UPDATE
		SET category = EXCLUDED.category, trust_weight = EXCLUDED.trust_weight, created_at = NOW()`,
		videoID, userID, category, trustWeight, ipHash, userAgent)
	if err != nil {
		return 0, err
	}

	if isNewVote {
		// Increment total votes on the video (only for new votes)
		_, err = tx.Exec(ctx, `
			UPDATE videos SET total_votes = total_votes + 1, last_updated = NOW()
			WHERE video_id = $1`, videoID)
		if err != nil {
			return 0, err
		}
	} else if existingCategory != category {
		// Decrement old category count if changing vote
		_, err = tx.Exec(ctx, `
			UPDATE video_categories SET vote_count = vote_count - 1
			WHERE video_id = $1 AND category = $2 AND vote_count > 0`,
			videoID, existingCategory)
		if err != nil {
			return 0, err
		}
	}

	// Upsert the per-category counter
	_, err = tx.Exec(ctx, `
		INSERT INTO video_categories (video_id, category, vote_count)
		VALUES ($1, $2, 1)
		ON CONFLICT (video_id, category) DO UPDATE
		SET vote_count = video_categories.vote_count + 1`,
		videoID, category)
	if err != nil {
		return 0, err
	}

	// Update last_updated on video
	_, err = tx.Exec(ctx, `UPDATE videos SET last_updated = NOW() WHERE video_id = $1`, videoID)
	if err != nil {
		return 0, err
	}

	err = tx.Commit(ctx)
	return trustWeight, err
}

// DeleteVote removes a user's vote on a video and adjusts counters atomically.
func (r *VoteRepo) DeleteVote(ctx context.Context, videoID, userID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Get the vote's category before deleting
	var category string
	err = tx.QueryRow(ctx, `
		SELECT category FROM votes WHERE video_id = $1 AND user_id = $2`,
		videoID, userID).Scan(&category)
	if err != nil {
		return err // returns pgx.ErrNoRows if vote doesn't exist
	}

	// Delete the vote
	_, err = tx.Exec(ctx, `DELETE FROM votes WHERE video_id = $1 AND user_id = $2`, videoID, userID)
	if err != nil {
		return err
	}

	// Decrement counters
	_, err = tx.Exec(ctx, `
		UPDATE videos SET total_votes = total_votes - 1, last_updated = NOW()
		WHERE video_id = $1 AND total_votes > 0`, videoID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		UPDATE video_categories SET vote_count = vote_count - 1
		WHERE video_id = $1 AND category = $2 AND vote_count > 0`,
		videoID, category)
	if err != nil {
		return err
	}

	// Manually notify score worker (DELETE trigger doesn't fire vote_inserted)
	_, err = tx.Exec(ctx, `SELECT pg_notify('vote_changes', $1)`, videoID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// GetVideoScore returns the current score of a video.
func (r *VoteRepo) GetVideoScore(ctx context.Context, videoID string) (float64, error) {
	var score float64
	err := r.pool.QueryRow(ctx, `SELECT score FROM videos WHERE video_id = $1`, videoID).Scan(&score)
	return score, err
}
