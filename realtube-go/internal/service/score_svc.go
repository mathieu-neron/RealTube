package service

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// CategoryScore holds the weighted score for a single category.
type CategoryScore struct {
	Category      string
	WeightSum     float64
	WeightedScore float64
}

// ScoreService recalculates video and category scores after vote changes.
type ScoreService struct {
	pool *pgxpool.Pool
}

func NewScoreService(pool *pgxpool.Pool) *ScoreService {
	return &ScoreService{pool: pool}
}

// RecalculateVideoScore computes per-category weighted scores and the overall
// video score for a given video. The algorithm:
//
//	For each category C:
//	  C_score = (sum of trust_weight for votes in C) / (sum of trust_weight for ALL votes) * 100
//	  video.score = max(C_score for all categories)
func (s *ScoreService) RecalculateVideoScore(ctx context.Context, videoID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Get total trust weight across all votes for this video
	var totalWeight float64
	err = tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(trust_weight), 0) FROM votes WHERE video_id = $1`,
		videoID).Scan(&totalWeight)
	if err != nil {
		return err
	}

	// No votes → reset score to 0
	if totalWeight == 0 {
		_, err = tx.Exec(ctx, `UPDATE videos SET score = 0, last_updated = NOW() WHERE video_id = $1`, videoID)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE video_categories SET weighted_score = 0 WHERE video_id = $1`, videoID)
		if err != nil {
			return err
		}
		return tx.Commit(ctx)
	}

	// Get per-category trust weight sums
	rows, err := tx.Query(ctx, `
		SELECT category, COALESCE(SUM(trust_weight), 0) AS weight_sum
		FROM votes
		WHERE video_id = $1
		GROUP BY category`,
		videoID)
	if err != nil {
		return err
	}
	defer rows.Close()

	var maxScore float64
	var categories []CategoryScore

	for rows.Next() {
		var cs CategoryScore
		if err := rows.Scan(&cs.Category, &cs.WeightSum); err != nil {
			return err
		}
		cs.WeightedScore = (cs.WeightSum / totalWeight) * 100
		if cs.WeightedScore > maxScore {
			maxScore = cs.WeightedScore
		}
		categories = append(categories, cs)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	// Update per-category weighted scores
	for _, cs := range categories {
		_, err = tx.Exec(ctx, `
			UPDATE video_categories SET weighted_score = $1
			WHERE video_id = $2 AND category = $3`,
			cs.WeightedScore, videoID, cs.Category)
		if err != nil {
			return err
		}
	}

	// Update overall video score (max across categories)
	_, err = tx.Exec(ctx, `UPDATE videos SET score = $1, last_updated = NOW() WHERE video_id = $2`,
		maxScore, videoID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// ComputeCategoryScores returns the per-category scores for a video without
// persisting them. Used for testing and read-only queries.
func (s *ScoreService) ComputeCategoryScores(ctx context.Context, videoID string) ([]CategoryScore, float64, error) {
	var totalWeight float64
	err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(trust_weight), 0) FROM votes WHERE video_id = $1`,
		videoID).Scan(&totalWeight)
	if err != nil {
		return nil, 0, err
	}

	if totalWeight == 0 {
		return nil, 0, nil
	}

	rows, err := s.pool.Query(ctx, `
		SELECT category, COALESCE(SUM(trust_weight), 0) AS weight_sum
		FROM votes
		WHERE video_id = $1
		GROUP BY category`,
		videoID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var maxScore float64
	var categories []CategoryScore

	for rows.Next() {
		var cs CategoryScore
		if err := rows.Scan(&cs.Category, &cs.WeightSum); err != nil {
			return nil, 0, err
		}
		cs.WeightedScore = (cs.WeightSum / totalWeight) * 100
		if cs.WeightedScore > maxScore {
			maxScore = cs.WeightedScore
		}
		categories = append(categories, cs)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	return categories, maxScore, nil
}
