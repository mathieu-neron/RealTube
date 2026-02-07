package service

import (
	"context"
	"time"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/model"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/repository"
)

type ChannelService struct {
	repo *repository.ChannelRepo
}

func NewChannelService(repo *repository.ChannelRepo) *ChannelService {
	return &ChannelService{repo: repo}
}

// Lookup returns the channel response for a given channel ID.
func (s *ChannelService) Lookup(ctx context.Context, channelID string) (*model.ChannelResponse, error) {
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

	return &model.ChannelResponse{
		ChannelID:     ch.ChannelID,
		Score:         ch.Score,
		TotalVideos:   ch.TotalVideos,
		FlaggedVideos: ch.FlaggedVideos,
		TopCategories: topCats,
		Locked:        ch.Locked,
		LastUpdated:   ch.LastUpdated.Format(time.RFC3339),
	}, nil
}

// RecalculateScore recomputes the channel's score from its videos.
func (s *ChannelService) RecalculateScore(ctx context.Context, channelID string) error {
	return s.repo.ComputeChannelScore(ctx, channelID)
}
