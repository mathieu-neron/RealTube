package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/model"
)

type VideoRepo struct {
	pool *pgxpool.Pool
}

func NewVideoRepo(pool *pgxpool.Pool) *VideoRepo {
	return &VideoRepo{pool: pool}
}

// FindByHashPrefix returns all non-hidden videos whose SHA256 hash starts with the given prefix.
func (r *VideoRepo) FindByHashPrefix(ctx context.Context, prefix string) ([]model.Video, error) {
	query := `
		SELECT video_id, channel_id, title, score, total_votes, locked, hidden, shadow_hidden,
		       video_duration, is_short, first_reported, last_updated, service
		FROM videos
		WHERE encode(sha256(video_id::bytea), 'hex') LIKE $1 || '%'
		  AND hidden = false AND shadow_hidden = false
		LIMIT 1000`

	rows, err := r.pool.Query(ctx, query, prefix)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var videos []model.Video
	for rows.Next() {
		var v model.Video
		err := rows.Scan(
			&v.VideoID, &v.ChannelID, &v.Title, &v.Score, &v.TotalVotes,
			&v.Locked, &v.Hidden, &v.ShadowHidden,
			&v.VideoDuration, &v.IsShort, &v.FirstReported, &v.LastUpdated, &v.Service,
		)
		if err != nil {
			return nil, err
		}
		videos = append(videos, v)
	}
	return videos, rows.Err()
}

// FindByVideoID returns a single video by exact ID, excluding hidden ones.
func (r *VideoRepo) FindByVideoID(ctx context.Context, videoID string) (*model.Video, error) {
	query := `
		SELECT video_id, channel_id, title, score, total_votes, locked, hidden, shadow_hidden,
		       video_duration, is_short, first_reported, last_updated, service
		FROM videos
		WHERE video_id = $1
		  AND hidden = false AND shadow_hidden = false`

	var v model.Video
	err := r.pool.QueryRow(ctx, query, videoID).Scan(
		&v.VideoID, &v.ChannelID, &v.Title, &v.Score, &v.TotalVotes,
		&v.Locked, &v.Hidden, &v.ShadowHidden,
		&v.VideoDuration, &v.IsShort, &v.FirstReported, &v.LastUpdated, &v.Service,
	)
	if err != nil {
		return nil, err
	}
	return &v, nil
}

// GetCategories returns all category vote aggregates for a given video.
func (r *VideoRepo) GetCategories(ctx context.Context, videoID string) ([]model.VideoCategory, error) {
	query := `
		SELECT video_id, category, vote_count, weighted_score
		FROM video_categories
		WHERE video_id = $1`

	rows, err := r.pool.Query(ctx, query, videoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []model.VideoCategory
	for rows.Next() {
		var c model.VideoCategory
		err := rows.Scan(&c.VideoID, &c.Category, &c.VoteCount, &c.WeightedScore)
		if err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, rows.Err()
}
