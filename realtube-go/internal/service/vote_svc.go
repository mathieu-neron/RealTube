package service

import (
	"context"
	"fmt"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/model"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/repository"
)

type VoteService struct {
	repo     *repository.VoteRepo
	scoreSvc *ScoreService
}

func NewVoteService(repo *repository.VoteRepo, scoreSvc *ScoreService) *VoteService {
	return &VoteService{repo: repo, scoreSvc: scoreSvc}
}

// Submit processes a vote submission request.
func (s *VoteService) Submit(ctx context.Context, req model.VoteRequest, ipHash string) (*model.VoteResponse, error) {
	if !repository.ValidCategories[req.Category] {
		return nil, fmt.Errorf("invalid category: %s", req.Category)
	}

	trustWeight, err := s.repo.SubmitVote(ctx, req.VideoID, req.UserID, req.Category, ipHash, req.UserAgent)
	if err != nil {
		return nil, err
	}

	// Recalculate video score after vote change
	if err := s.scoreSvc.RecalculateVideoScore(ctx, req.VideoID); err != nil {
		return nil, err
	}

	score, err := s.repo.GetVideoScore(ctx, req.VideoID)
	if err != nil {
		return nil, err
	}

	return &model.VoteResponse{
		Success:   true,
		NewScore:  score,
		UserTrust: trustWeight,
	}, nil
}

// Delete removes a user's vote and recalculates the video score.
func (s *VoteService) Delete(ctx context.Context, req model.VoteDeleteRequest) error {
	if err := s.repo.DeleteVote(ctx, req.VideoID, req.UserID); err != nil {
		return err
	}
	return s.scoreSvc.RecalculateVideoScore(ctx, req.VideoID)
}
