package service

import (
	"math"
	"time"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/model"
)

const (
	ageWeight      = 0.30
	accuracyWeight = 0.50
	volumeWeight   = 0.20

	// Full age factor after 60 days
	ageDaysMax = 60.0

	// Default accuracy for users with fewer than 10 votes
	defaultAccuracy    = 0.5
	minVotesForAccuracy = 10

	// Full volume factor at 100 votes
	volumeVotesMax = 100.0

	// Vote base weights
	BaseWeightRegular     = 1.0
	BaseWeightVIP         = 3.0
	BaseWeightShadowbanned = 0.0
)

type TrustService struct{}

func NewTrustService() *TrustService {
	return &TrustService{}
}

// ComputeTrustScore calculates the trust score for a user based on the algorithm:
//   trust_score = (age_factor * 0.30) + (accuracy_factor * 0.50) + (volume_factor * 0.20)
func (s *TrustService) ComputeTrustScore(user *model.User) float64 {
	ageFactor := s.AgeFactor(user.FirstSeen)
	accuracyFactor := s.AccuracyFactor(user.AccuracyRate, user.TotalVotes)
	volumeFactor := s.VolumeFactor(user.TotalVotes)

	score := (ageFactor * ageWeight) + (accuracyFactor * accuracyWeight) + (volumeFactor * volumeWeight)
	return math.Min(score, 1.0)
}

// AgeFactor returns a value between 0.0 and 1.0 based on account age.
// Full weight (1.0) after 60 days.
func (s *TrustService) AgeFactor(firstSeen time.Time) float64 {
	days := time.Since(firstSeen).Hours() / 24
	return math.Min(days/ageDaysMax, 1.0)
}

// AccuracyFactor returns the accuracy rate for users with 10+ votes,
// or the default 0.5 for users with fewer votes.
func (s *TrustService) AccuracyFactor(accuracyRate float64, totalVotes int) float64 {
	if totalVotes < minVotesForAccuracy {
		return defaultAccuracy
	}
	return accuracyRate
}

// VolumeFactor returns a value between 0.0 and 1.0 based on total votes.
// Full weight (1.0) at 100+ votes.
func (s *TrustService) VolumeFactor(totalVotes int) float64 {
	return math.Min(float64(totalVotes)/volumeVotesMax, 1.0)
}

// EffectiveWeight calculates the effective vote weight for a user.
//   effective_weight = trust_score * base_weight
func (s *TrustService) EffectiveWeight(user *model.User) float64 {
	baseWeight := s.BaseWeight(user)
	return s.ComputeTrustScore(user) * baseWeight
}

// BaseWeight returns the base vote weight multiplier for a user.
func (s *TrustService) BaseWeight(user *model.User) float64 {
	if user.IsShadowbanned {
		return BaseWeightShadowbanned
	}
	if user.IsVIP {
		return BaseWeightVIP
	}
	return BaseWeightRegular
}
