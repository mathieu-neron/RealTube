package service

import (
	"context"
	"encoding/json"
	"log"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/model"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/repository"
)

type VideoService struct {
	repo  *repository.VideoRepo
	cache *CacheService
}

func NewVideoService(repo *repository.VideoRepo, cache *CacheService) *VideoService {
	return &VideoService{repo: repo, cache: cache}
}

// LookupByHashPrefix finds videos by hash prefix and builds API responses with categories.
func (s *VideoService) LookupByHashPrefix(ctx context.Context, prefix string) ([]model.VideoResponse, error) {
	videos, err := s.repo.FindByHashPrefix(ctx, prefix)
	if err != nil {
		return nil, err
	}
	return s.buildResponses(ctx, videos)
}

// LookupByVideoID finds a single video by exact ID and builds its API response.
// Uses cache-aside: check Redis first, fall back to DB, then populate cache.
func (s *VideoService) LookupByVideoID(ctx context.Context, videoID string) (*model.VideoResponse, error) {
	// Try cache first
	if s.cache != nil {
		cached, err := s.cache.GetVideo(ctx, videoID)
		if err != nil {
			log.Printf("cache: video get error: %v", err)
		} else if cached != nil {
			var resp model.VideoResponse
			if err := json.Unmarshal(cached, &resp); err == nil {
				return &resp, nil
			}
		}
	}

	// Cache miss — fetch from DB
	video, err := s.repo.FindByVideoID(ctx, videoID)
	if err != nil {
		return nil, err
	}

	resp, err := s.buildResponse(ctx, *video)
	if err != nil {
		return nil, err
	}

	// Populate cache
	if s.cache != nil {
		if err := s.cache.SetVideo(ctx, videoID, &resp); err != nil {
			log.Printf("cache: video set error: %v", err)
		}
	}

	return &resp, nil
}

func (s *VideoService) buildResponses(ctx context.Context, videos []model.Video) ([]model.VideoResponse, error) {
	responses := make([]model.VideoResponse, 0, len(videos))
	for _, v := range videos {
		resp, err := s.buildResponse(ctx, v)
		if err != nil {
			return nil, err
		}
		responses = append(responses, resp)
	}
	return responses, nil
}

func (s *VideoService) buildResponse(ctx context.Context, v model.Video) (model.VideoResponse, error) {
	cats, err := s.repo.GetCategories(ctx, v.VideoID)
	if err != nil {
		return model.VideoResponse{}, err
	}

	categories := make(map[string]*model.CategoryDetail, len(cats))
	for _, c := range cats {
		categories[c.Category] = &model.CategoryDetail{
			Votes:         c.VoteCount,
			WeightedScore: c.WeightedScore,
		}
	}

	return model.VideoResponse{
		VideoID:     v.VideoID,
		Score:       v.Score,
		Categories:  categories,
		TotalVotes:  v.TotalVotes,
		Locked:      v.Locked,
		ChannelID:   v.ChannelID,
		LastUpdated: v.LastUpdated,
	}, nil
}
