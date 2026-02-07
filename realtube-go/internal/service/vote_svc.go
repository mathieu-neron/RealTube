package service

import (
	"context"
	"fmt"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/model"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/repository"
)

type VoteService struct {
	repo *repository.VoteRepo
}

func NewVoteService(repo *repository.VoteRepo) *VoteService {
	return &VoteService{repo: repo}
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

// Delete removes a user's vote.
func (s *VoteService) Delete(ctx context.Context, req model.VoteDeleteRequest) error {
	return s.repo.DeleteVote(ctx, req.VideoID, req.UserID)
}
