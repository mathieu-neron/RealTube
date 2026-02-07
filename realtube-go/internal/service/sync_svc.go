package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/model"
)

type SyncService struct {
	pool       *pgxpool.Pool
	videoSvc   *VideoService
	channelSvc *ChannelService
}

func NewSyncService(pool *pgxpool.Pool, videoSvc *VideoService, channelSvc *ChannelService) *SyncService {
	return &SyncService{pool: pool, videoSvc: videoSvc, channelSvc: channelSvc}
}

// DeltaSync returns all video and channel changes since the given timestamp.
// It reads from the sync_cache table (populated after score recalculations).
func (s *SyncService) DeltaSync(ctx context.Context, since time.Time) (*model.SyncDeltaResponse, error) {
	// Fetch changed videos from sync_cache
	videoQuery := `
		SELECT video_id, score, categories, channel_id, action
		FROM sync_cache
		WHERE changed_at > $1
		ORDER BY changed_at ASC`

	rows, err := s.pool.Query(ctx, videoQuery, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var videos []model.SyncVideoEntry
	for rows.Next() {
		var entry model.SyncVideoEntry
		var categoriesJSON []byte
		var channelID *string
		err := rows.Scan(&entry.VideoID, &entry.Score, &categoriesJSON, &channelID, &entry.Action)
		if err != nil {
			return nil, err
		}

		if entry.Action == "update" && len(categoriesJSON) > 0 {
			var cats map[string]*model.CategoryDetail
			if err := json.Unmarshal(categoriesJSON, &cats); err == nil {
				entry.Categories = cats
			}
		}

		videos = append(videos, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Fetch changed channels (those updated since the given timestamp)
	channelQuery := `
		SELECT channel_id, score
		FROM channels
		WHERE last_updated > $1
		ORDER BY last_updated ASC`

	channelRows, err := s.pool.Query(ctx, channelQuery, since)
	if err != nil {
		return nil, err
	}
	defer channelRows.Close()

	var channels []model.SyncChannelEntry
	for channelRows.Next() {
		var entry model.SyncChannelEntry
		err := channelRows.Scan(&entry.ChannelID, &entry.Score)
		if err != nil {
			return nil, err
		}
		entry.Action = "update"
		channels = append(channels, entry)
	}
	if err := channelRows.Err(); err != nil {
		return nil, err
	}

	if videos == nil {
		videos = []model.SyncVideoEntry{}
	}
	if channels == nil {
		channels = []model.SyncChannelEntry{}
	}

	return &model.SyncDeltaResponse{
		Videos:        videos,
		Channels:      channels,
		SyncTimestamp: time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// FullSync returns the complete dataset of all flagged videos and channels.
func (s *SyncService) FullSync(ctx context.Context) (*model.SyncFullResponse, error) {
	// Fetch all non-hidden videos with score > 0
	videoQuery := `
		SELECT video_id, channel_id, title, score, total_votes, locked, hidden, shadow_hidden,
		       video_duration, is_short, first_reported, last_updated, service
		FROM videos
		WHERE hidden = false AND shadow_hidden = false AND score > 0
		ORDER BY last_updated DESC`

	rows, err := s.pool.Query(ctx, videoQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var videoResponses []model.VideoResponse
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

		videoResponses = append(videoResponses, model.VideoResponse{
			VideoID:     v.VideoID,
			Score:       v.Score,
			Categories:  nil, // Full sync omits per-video categories for performance
			TotalVotes:  v.TotalVotes,
			Locked:      v.Locked,
			ChannelID:   v.ChannelID,
			LastUpdated: v.LastUpdated,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Fetch all channels with score > 0
	channelQuery := `
		SELECT channel_id, score, total_videos, flagged_videos, top_category, locked, last_updated
		FROM channels
		WHERE score > 0
		ORDER BY last_updated DESC`

	channelRows, err := s.pool.Query(ctx, channelQuery)
	if err != nil {
		return nil, err
	}
	defer channelRows.Close()

	var channelResponses []model.ChannelResponse
	for channelRows.Next() {
		var ch model.ChannelResponse
		var topCategory *string
		var lastUpdated time.Time
		err := channelRows.Scan(&ch.ChannelID, &ch.Score, &ch.TotalVideos,
			&ch.FlaggedVideos, &topCategory, &ch.Locked, &lastUpdated)
		if err != nil {
			return nil, err
		}
		ch.LastUpdated = lastUpdated.Format(time.RFC3339)
		if topCategory != nil {
			ch.TopCategories = []string{*topCategory}
		} else {
			ch.TopCategories = []string{}
		}
		channelResponses = append(channelResponses, ch)
	}
	if err := channelRows.Err(); err != nil {
		return nil, err
	}

	if videoResponses == nil {
		videoResponses = []model.VideoResponse{}
	}
	if channelResponses == nil {
		channelResponses = []model.ChannelResponse{}
	}

	return &model.SyncFullResponse{
		Videos:      videoResponses,
		Channels:    channelResponses,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
	}, nil
}
