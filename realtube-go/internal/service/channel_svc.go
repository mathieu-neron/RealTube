package service

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/model"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/repository"
)

type ChannelService struct {
	repo  *repository.ChannelRepo
	cache *CacheService
}

func NewChannelService(repo *repository.ChannelRepo, cache *CacheService) *ChannelService {
	return &ChannelService{repo: repo, cache: cache}
}

// Lookup returns the channel response for a given channel ID.
// Uses cache-aside: check Redis first, fall back to DB, then populate cache.
func (s *ChannelService) Lookup(ctx context.Context, channelID string) (*model.ChannelResponse, error) {
	// Try cache first
	if s.cache != nil {
		cached, err := s.cache.GetChannel(ctx, channelID)
		if err != nil {
			log.Printf("cache: channel get error: %v", err)
		} else if cached != nil {
			var resp model.ChannelResponse
			if err := json.Unmarshal(cached, &resp); err == nil {
				return &resp, nil
			}
		}
	}

	// Cache miss — fetch from DB
	ch, err := s.repo.FindByChannelID(ctx, channelID)
	if err != nil {
		return nil, err
	}

	topCats, err := s.repo.GetTopCategories(ctx, channelID)
	if err != nil {
		return nil, err
	}
	if topCats == nil {
		topCats = []string{}
	}

	resp := &model.ChannelResponse{
		ChannelID:     ch.ChannelID,
		Score:         ch.Score,
		TotalVideos:   ch.TotalVideos,
		FlaggedVideos: ch.FlaggedVideos,
		TopCategories: topCats,
		Locked:        ch.Locked,
		LastUpdated:   ch.LastUpdated.Format(time.RFC3339),
	}

	// Populate cache
	if s.cache != nil {
		if err := s.cache.SetChannel(ctx, channelID, resp); err != nil {
			log.Printf("cache: channel set error: %v", err)
		}
	}

	return resp, nil
}

// RecalculateScore recomputes the channel's score from its videos.
func (s *ChannelService) RecalculateScore(ctx context.Context, channelID string) error {
	return s.repo.ComputeChannelScore(ctx, channelID)
}
