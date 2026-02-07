package service

import (
	"math"
	"testing"
)

// computeScoresFromVotes is a pure-logic helper that mirrors the DB-based
// RecalculateVideoScore algorithm for unit testing without a database.
func computeScoresFromVotes(votes []struct {
	Category    string
	TrustWeight float64
}) (map[string]float64, float64) {
	if len(votes) == 0 {
		return nil, 0
	}

	var totalWeight float64
	for _, v := range votes {
		totalWeight += v.TrustWeight
	}

	if totalWeight == 0 {
		return nil, 0
	}

	categoryWeights := make(map[string]float64)
	for _, v := range votes {
		categoryWeights[v.Category] += v.TrustWeight
	}

	scores := make(map[string]float64)
	var maxScore float64
	for cat, w := range categoryWeights {
		score := (w / totalWeight) * 100
		scores[cat] = score
		if score > maxScore {
			maxScore = score
		}
	}

	return scores, maxScore
}

func TestScoreCalculation_SingleCategory(t *testing.T) {
	votes := []struct {
		Category    string
		TrustWeight float64
	}{
		{"fully_ai", 0.8},
		{"fully_ai", 0.6},
		{"fully_ai", 1.0},
	}

	scores, maxScore := computeScoresFromVotes(votes)

	// All votes in one category → that category = 100%
	if scores["fully_ai"] != 100.0 {
		t.Errorf("single category score = %.2f, want 100.00", scores["fully_ai"])
	}
	if maxScore != 100.0 {
		t.Errorf("max score = %.2f, want 100.00", maxScore)
	}
}

func TestScoreCalculation_MultipleCategories(t *testing.T) {
	votes := []struct {
		Category    string
		TrustWeight float64
	}{
		{"fully_ai", 1.0},
		{"fully_ai", 1.0},
		{"ai_voiceover", 0.5},
		{"ai_visuals", 0.5},
	}

	scores, maxScore := computeScoresFromVotes(votes)

	// Total weight = 3.0
	// fully_ai = 2.0/3.0 * 100 = 66.67
	// ai_voiceover = 0.5/3.0 * 100 = 16.67
	// ai_visuals = 0.5/3.0 * 100 = 16.67
	if !almostEqual(scores["fully_ai"], 66.67, 0.01) {
		t.Errorf("fully_ai score = %.2f, want ~66.67", scores["fully_ai"])
	}
	if !almostEqual(scores["ai_voiceover"], 16.67, 0.01) {
		t.Errorf("ai_voiceover score = %.2f, want ~16.67", scores["ai_voiceover"])
	}
	if !almostEqual(scores["ai_visuals"], 16.67, 0.01) {
		t.Errorf("ai_visuals score = %.2f, want ~16.67", scores["ai_visuals"])
	}
	// Max should be fully_ai
	if !almostEqual(maxScore, 66.67, 0.01) {
		t.Errorf("max score = %.2f, want ~66.67", maxScore)
	}
}

func TestScoreCalculation_NoVotes(t *testing.T) {
	votes := []struct {
		Category    string
		TrustWeight float64
	}{}

	scores, maxScore := computeScoresFromVotes(votes)

	if scores != nil {
		t.Errorf("expected nil scores for no votes, got %v", scores)
	}
	if maxScore != 0 {
		t.Errorf("max score = %.2f, want 0.00", maxScore)
	}
}

func TestScoreCalculation_ZeroWeightVotes(t *testing.T) {
	// Shadowbanned users have trust_weight = 0
	votes := []struct {
		Category    string
		TrustWeight float64
	}{
		{"fully_ai", 0.0},
		{"fully_ai", 0.0},
	}

	scores, maxScore := computeScoresFromVotes(votes)

	if scores != nil {
		t.Errorf("expected nil scores for zero-weight votes, got %v", scores)
	}
	if maxScore != 0 {
		t.Errorf("max score = %.2f, want 0.00 for zero-weight votes", maxScore)
	}
}

func TestScoreCalculation_TrustWeightAffectsScore(t *testing.T) {
	// One high-trust vote for fully_ai, many low-trust votes for ai_voiceover
	votes := []struct {
		Category    string
		TrustWeight float64
	}{
		{"fully_ai", 3.0},     // VIP user
		{"ai_voiceover", 0.1}, // low trust
		{"ai_voiceover", 0.1}, // low trust
		{"ai_voiceover", 0.1}, // low trust
	}

	scores, maxScore := computeScoresFromVotes(votes)

	// Total weight = 3.3
	// fully_ai = 3.0/3.3 * 100 ≈ 90.91
	// ai_voiceover = 0.3/3.3 * 100 ≈ 9.09
	if !almostEqual(scores["fully_ai"], 90.91, 0.01) {
		t.Errorf("fully_ai score = %.2f, want ~90.91", scores["fully_ai"])
	}
	if !almostEqual(scores["ai_voiceover"], 9.09, 0.01) {
		t.Errorf("ai_voiceover score = %.2f, want ~9.09", scores["ai_voiceover"])
	}
	if !almostEqual(maxScore, 90.91, 0.01) {
		t.Errorf("max score = %.2f, want ~90.91", maxScore)
	}
}

func TestScoreCalculation_EvenSplit(t *testing.T) {
	// Equal weight across 5 categories
	votes := []struct {
		Category    string
		TrustWeight float64
	}{
		{"fully_ai", 1.0},
		{"ai_voiceover", 1.0},
		{"ai_visuals", 1.0},
		{"ai_thumbnails", 1.0},
		{"ai_assisted", 1.0},
	}

	scores, maxScore := computeScoresFromVotes(votes)

	// Each category = 1.0/5.0 * 100 = 20.0
	for _, cat := range []string{"fully_ai", "ai_voiceover", "ai_visuals", "ai_thumbnails", "ai_assisted"} {
		if scores[cat] != 20.0 {
			t.Errorf("%s score = %.2f, want 20.00", cat, scores[cat])
		}
	}
	if maxScore != 20.0 {
		t.Errorf("max score = %.2f, want 20.00", maxScore)
	}
}

func TestScoreCalculation_OverallScoreIsMax(t *testing.T) {
	// Verify overall = max, not sum or average
	votes := []struct {
		Category    string
		TrustWeight float64
	}{
		{"fully_ai", 2.0},
		{"ai_voiceover", 1.0},
	}

	_, maxScore := computeScoresFromVotes(votes)

	// fully_ai = 2.0/3.0 * 100 = 66.67 (the max)
	// ai_voiceover = 1.0/3.0 * 100 = 33.33
	// max should be 66.67, NOT sum (100) or average (50)
	if !almostEqual(maxScore, 66.67, 0.01) {
		t.Errorf("max score = %.2f, want ~66.67 (should be max, not sum or avg)", maxScore)
	}
}

func TestScoreCalculation_MixedWeights(t *testing.T) {
	votes := []struct {
		Category    string
		TrustWeight float64
	}{
		{"fully_ai", 0.975},   // veteran user
		{"fully_ai", 0.25},    // new user
		{"ai_voiceover", 0.6}, // mid-tier user
	}

	scores, maxScore := computeScoresFromVotes(votes)

	// Total weight = 1.825
	// fully_ai = 1.225/1.825 * 100 ≈ 67.12
	// ai_voiceover = 0.6/1.825 * 100 ≈ 32.88
	totalWeight := 0.975 + 0.25 + 0.6
	expectedFullyAI := (0.975 + 0.25) / totalWeight * 100
	expectedVoiceover := 0.6 / totalWeight * 100

	if !almostEqual(scores["fully_ai"], expectedFullyAI, 0.01) {
		t.Errorf("fully_ai score = %.2f, want %.2f", scores["fully_ai"], expectedFullyAI)
	}
	if !almostEqual(scores["ai_voiceover"], expectedVoiceover, 0.01) {
		t.Errorf("ai_voiceover score = %.2f, want %.2f", scores["ai_voiceover"], expectedVoiceover)
	}
	if !almostEqual(maxScore, math.Max(expectedFullyAI, expectedVoiceover), 0.01) {
		t.Errorf("max score = %.2f, want %.2f", maxScore, math.Max(expectedFullyAI, expectedVoiceover))
	}
}
