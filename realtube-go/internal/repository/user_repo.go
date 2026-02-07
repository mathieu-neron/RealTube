package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/model"
)

type UserRepo struct {
	pool *pgxpool.Pool
}

func NewUserRepo(pool *pgxpool.Pool) *UserRepo {
	return &UserRepo{pool: pool}
}

// FindByUserID returns a single user by their hashed user ID.
func (r *UserRepo) FindByUserID(ctx context.Context, userID string) (*model.User, error) {
	query := `
		SELECT user_id, trust_score, accuracy_rate, total_votes, accurate_votes,
		       first_seen, last_active, is_vip, is_shadowbanned, ban_reason, username
		FROM users
		WHERE user_id = $1`

	var u model.User
	err := r.pool.QueryRow(ctx, query, userID).Scan(
		&u.UserID, &u.TrustScore, &u.AccuracyRate, &u.TotalVotes, &u.AccurateVotes,
		&u.FirstSeen, &u.LastActive, &u.IsVIP, &u.IsShadowbanned, &u.BanReason, &u.Username,
	)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// CreateIfNotExists inserts a new user with default values if one doesn't already exist.
func (r *UserRepo) CreateIfNotExists(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO users (user_id) VALUES ($1)
		ON CONFLICT (user_id) DO NOTHING`, userID)
	return err
}

// GetStats returns aggregate statistics from all tables.
func (r *UserRepo) GetStats(ctx context.Context) (*model.StatsResponse, error) {
	query := `
		SELECT
			(SELECT COUNT(*) FROM videos WHERE hidden = false AND shadow_hidden = false) AS total_videos,
			(SELECT COUNT(*) FROM channels) AS total_channels,
			(SELECT COUNT(*) FROM votes) AS total_votes,
			(SELECT COUNT(*) FROM users) AS total_users,
			(SELECT COUNT(*) FROM users WHERE last_active > NOW() - INTERVAL '24 hours') AS active_users_24h`

	var stats model.StatsResponse
	err := r.pool.QueryRow(ctx, query).Scan(
		&stats.TotalVideos, &stats.TotalChannels, &stats.TotalVotes,
		&stats.TotalUsers, &stats.ActiveUsers24h,
	)
	if err != nil {
		return nil, err
	}

	catQuery := `
		SELECT category, SUM(vote_count) AS total
		FROM video_categories
		GROUP BY category
		ORDER BY total DESC`

	rows, err := r.pool.Query(ctx, catQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stats.TopCategories = make(map[string]int)
	for rows.Next() {
		var cat string
		var count int
		if err := rows.Scan(&cat, &count); err != nil {
			return nil, err
		}
		stats.TopCategories[cat] = count
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &stats, nil
}
