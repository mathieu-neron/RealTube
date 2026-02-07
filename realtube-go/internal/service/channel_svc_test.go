package service

import (
	"testing"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/repository"
)

func TestChannelScore_NoTrackedVideos(t *testing.T) {
	score := repository.ComputeChannelScorePure(0, 0, 0)
	if score != 0 {
		t.Errorf("score = %.2f, want 0.00 (no tracked videos)", score)
	}
}

func TestChannelScore_BelowStabilityMinimum(t *testing.T) {
	// Only 2 tracked videos (below minimum of 3)
	score := repository.ComputeChannelScorePure(2, 2, 80.0)
	if score != 0 {
		t.Errorf("score = %.2f, want 0.00 (below stability minimum of 3)", score)
	}
}

func TestChannelScore_AllVideosFlagged(t *testing.T) {
	// 5 out of 5 tracked videos are flagged, avg flagged score = 85.0
	// channel_score = (5/5) * 85.0 = 85.0
	score := repository.ComputeChannelScorePure(5, 5, 85.0)
	if score != 85.0 {
		t.Errorf("score = %.2f, want 85.00", score)
	}
}

func TestChannelScore_MixFlaggedAndUnflagged(t *testing.T) {
	// 3 out of 6 tracked videos are flagged, avg flagged score = 70.0
	// channel_score = (3/6) * 70.0 = 35.0
	score := repository.ComputeChannelScorePure(3, 6, 70.0)
	if score != 35.0 {
		t.Errorf("score = %.2f, want 35.00", score)
	}
}

func TestChannelScore_FormulaCorrectness(t *testing.T) {
	// 7 flagged out of 10 tracked, avg flagged score = 62.5
	// channel_score = (7/10) * 62.5 = 43.75
	score := repository.ComputeChannelScorePure(7, 10, 62.5)
	if score != 43.75 {
		t.Errorf("score = %.2f, want 43.75", score)
	}
}

func TestChannelScore_ExactlyThreeTracked(t *testing.T) {
	// Boundary: exactly at stability minimum
	// 1 flagged out of 3 tracked, avg flagged score = 90.0
	// channel_score = (1/3) * 90.0 = 30.0
	score := repository.ComputeChannelScorePure(1, 3, 90.0)
	if score != 30.0 {
		t.Errorf("score = %.2f, want 30.00", score)
	}
}

func TestChannelScore_NoFlaggedVideos(t *testing.T) {
	// 0 flagged out of 5 tracked, avg flagged score = 0
	// channel_score = (0/5) * 0 = 0
	score := repository.ComputeChannelScorePure(0, 5, 0)
	if score != 0 {
		t.Errorf("score = %.2f, want 0.00 (no flagged videos)", score)
	}
}
