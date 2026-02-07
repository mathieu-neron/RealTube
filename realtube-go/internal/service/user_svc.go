package service

import (
	"context"
	"math"
	"time"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/model"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/repository"
)

type UserService struct {
	repo *repository.UserRepo
}

func NewUserService(repo *repository.UserRepo) *UserService {
	return &UserService{repo: repo}
}

// Lookup returns the user response for a given user ID.
func (s *UserService) Lookup(ctx context.Context, userID string) (*model.UserResponse, error) {
	u, err := s.repo.FindByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}

	accountAge := int(math.Floor(time.Since(u.FirstSeen).Hours() / 24))

	return &model.UserResponse{
		UserID:       u.UserID,
		TrustScore:   u.TrustScore,
		TotalVotes:   u.TotalVotes,
		AccuracyRate: u.AccuracyRate,
		AccountAge:   accountAge,
		IsVIP:        u.IsVIP,
	}, nil
}

// LookupOrCreate returns the user response, auto-creating a default user if not found.
func (s *UserService) LookupOrCreate(ctx context.Context, userID string) (*model.UserResponse, error) {
	resp, err := s.Lookup(ctx, userID)
	if err == nil {
		return resp, nil
	}

	// Auto-create user with defaults
	if err := s.repo.CreateIfNotExists(ctx, userID); err != nil {
		return nil, err
	}

	return s.Lookup(ctx, userID)
}

// GetStats returns aggregate platform statistics.
func (s *UserService) GetStats(ctx context.Context) (*model.StatsResponse, error) {
	return s.repo.GetStats(ctx)
}
