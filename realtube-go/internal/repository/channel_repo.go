package repository

import (
	"context"
	"math"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/model"
)

type ChannelRepo struct {
	pool *pgxpool.Pool
}

func NewChannelRepo(pool *pgxpool.Pool) *ChannelRepo {
	return &ChannelRepo{pool: pool}
}

// FindByChannelID returns a single channel by its ID.
func (r *ChannelRepo) FindByChannelID(ctx context.Context, channelID string) (*model.Channel, error) {
	query := `
		SELECT channel_id, channel_name, score, total_videos, flagged_videos,
		       top_category, locked, auto_flag_new, last_updated
		FROM channels
		WHERE channel_id = $1`

	var ch model.Channel
	err := r.pool.QueryRow(ctx, query, channelID).Scan(
		&ch.ChannelID, &ch.ChannelName, &ch.Score, &ch.TotalVideos, &ch.FlaggedVideos,
		&ch.TopCategory, &ch.Locked, &ch.AutoFlagNew, &ch.LastUpdated,
	)
	if err != nil {
		return nil, err
	}
	return &ch, nil
}

// GetTopCategories returns the top category names for a channel's videos,
// ordered by total weighted_score descending.
func (r *ChannelRepo) GetTopCategories(ctx context.Context, channelID string) ([]string, error) {
	query := `
		SELECT vc.category
		FROM video_categories vc
		JOIN videos v ON v.video_id = vc.video_id
		WHERE v.channel_id = $1
		GROUP BY vc.category
		ORDER BY SUM(vc.weighted_score) DESC`

	rows, err := r.pool.Query(ctx, query, channelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []string
	for rows.Next() {
		var cat string
		if err := rows.Scan(&cat); err != nil {
			return nil, err
		}
		categories = append(categories, cat)
	}
	return categories, rows.Err()
}

// ComputeChannelScore recalculates a channel's score from its videos.
//
// Algorithm (trust-system-design.md §10):
//
//	flagged_videos = count of videos with score >= 50
//	total_tracked_videos = count of videos with total_votes > 0 (min 3 for stability)
//	avg_flagged_score = average score of flagged videos
//	channel_score = (flagged_videos / total_tracked_videos) * avg_flagged_score
func (r *ChannelRepo) ComputeChannelScore(ctx context.Context, channelID string) error {
	query := `
		SELECT
			COUNT(*) FILTER (WHERE score >= 50)          AS flagged_videos,
			COUNT(*) FILTER (WHERE total_votes > 0)      AS total_tracked_videos,
			COALESCE(AVG(score) FILTER (WHERE score >= 50), 0) AS avg_flagged_score
		FROM videos
		WHERE channel_id = $1`

	var flagged, tracked int
	var avgFlaggedScore float64
	err := r.pool.QueryRow(ctx, query, channelID).Scan(&flagged, &tracked, &avgFlaggedScore)
	if err != nil {
		return err
	}

	channelScore := ComputeChannelScorePure(flagged, tracked, avgFlaggedScore)

	update := `
		UPDATE channels
		SET score = $1, flagged_videos = $2, total_videos = $3, last_updated = NOW()
		WHERE channel_id = $4`

	_, err = r.pool.Exec(ctx, update, channelScore, flagged, tracked, channelID)
	return err
}

// ComputeChannelScorePure is a pure-logic helper for unit testing.
func ComputeChannelScorePure(flagged, tracked int, avgFlaggedScore float64) float64 {
	if tracked < 3 {
		return 0
	}
	score := (float64(flagged) / float64(tracked)) * avgFlaggedScore
	return math.Round(score*100) / 100
}
