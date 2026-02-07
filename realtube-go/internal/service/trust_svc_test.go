package service

import (
	"math"
	"testing"
	"time"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/model"
)

func TestAgeFactor(t *testing.T) {
	svc := NewTrustService()

	tests := []struct {
		name      string
		daysAgo   int
		wantMin   float64
		wantMax   float64
	}{
		{"brand new account", 0, 0.0, 0.02},
		{"1 day old", 1, 0.01, 0.03},
		{"30 days old", 30, 0.49, 0.51},
		{"60 days old", 60, 0.99, 1.0},
		{"120 days old (capped)", 120, 1.0, 1.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			firstSeen := time.Now().AddDate(0, 0, -tt.daysAgo)
			got := svc.AgeFactor(firstSeen)
			if got < tt.wantMin || got > tt.wantMax {
				t.Errorf("AgeFactor(%d days ago) = %.4f, want [%.2f, %.2f]", tt.daysAgo, got, tt.wantMin, tt.wantMax)
			}
		})
	}
}

func TestAccuracyFactor(t *testing.T) {
	svc := NewTrustService()

	tests := []struct {
		name         string
		accuracyRate float64
		totalVotes   int
		want         float64
	}{
		{"fewer than 10 votes, uses default", 0.9, 5, 0.5},
		{"exactly 10 votes, uses actual", 0.8, 10, 0.8},
		{"many votes, high accuracy", 0.95, 200, 0.95},
		{"many votes, low accuracy", 0.2, 50, 0.2},
		{"zero votes, uses default", 0.0, 0, 0.5},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := svc.AccuracyFactor(tt.accuracyRate, tt.totalVotes)
			if got != tt.want {
				t.Errorf("AccuracyFactor(%.2f, %d) = %.2f, want %.2f", tt.accuracyRate, tt.totalVotes, got, tt.want)
			}
		})
	}
}

func TestVolumeFactor(t *testing.T) {
	svc := NewTrustService()

	tests := []struct {
		name       string
		totalVotes int
		want       float64
	}{
		{"zero votes", 0, 0.0},
		{"50 votes", 50, 0.5},
		{"100 votes", 100, 1.0},
		{"200 votes (capped)", 200, 1.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := svc.VolumeFactor(tt.totalVotes)
			if got != tt.want {
				t.Errorf("VolumeFactor(%d) = %.2f, want %.2f", tt.totalVotes, got, tt.want)
			}
		})
	}
}

func almostEqual(a, b, epsilon float64) bool {
	return math.Abs(a-b) < epsilon
}

func TestComputeTrustScore(t *testing.T) {
	svc := NewTrustService()

	tests := []struct {
		name     string
		user     model.User
		wantMin  float64
		wantMax  float64
	}{
		{
			name: "brand new user (low trust)",
			user: model.User{
				FirstSeen:    time.Now(),
				AccuracyRate: 0.0,
				TotalVotes:   0,
			},
			// age=0, accuracy=0.5 (default <10 votes), volume=0
			// 0*0.3 + 0.5*0.5 + 0*0.2 = 0.25
			wantMin: 0.24,
			wantMax: 0.26,
		},
		{
			name: "veteran accurate user (high trust)",
			user: model.User{
				FirstSeen:    time.Now().AddDate(0, 0, -120),
				AccuracyRate: 0.95,
				TotalVotes:   200,
			},
			// age=1.0, accuracy=0.95, volume=1.0
			// 1.0*0.3 + 0.95*0.5 + 1.0*0.2 = 0.3 + 0.475 + 0.2 = 0.975
			wantMin: 0.97,
			wantMax: 0.98,
		},
		{
			name: "mid-tier user",
			user: model.User{
				FirstSeen:    time.Now().AddDate(0, 0, -30),
				AccuracyRate: 0.7,
				TotalVotes:   50,
			},
			// age=0.5, accuracy=0.7, volume=0.5
			// 0.5*0.3 + 0.7*0.5 + 0.5*0.2 = 0.15 + 0.35 + 0.10 = 0.60
			wantMin: 0.59,
			wantMax: 0.61,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := svc.ComputeTrustScore(&tt.user)
			if got < tt.wantMin || got > tt.wantMax {
				t.Errorf("ComputeTrustScore() = %.4f, want [%.2f, %.2f]", got, tt.wantMin, tt.wantMax)
			}
		})
	}
}

func TestEffectiveWeight(t *testing.T) {
	svc := NewTrustService()

	veteranUser := model.User{
		FirstSeen:    time.Now().AddDate(0, 0, -120),
		AccuracyRate: 0.95,
		TotalVotes:   200,
	}
	trust := svc.ComputeTrustScore(&veteranUser)

	tests := []struct {
		name string
		user model.User
		want float64
	}{
		{
			name: "regular user",
			user: veteranUser,
			want: trust * BaseWeightRegular,
		},
		{
			name: "VIP user (3x multiplier)",
			user: func() model.User {
				u := veteranUser
				u.IsVIP = true
				return u
			}(),
			want: trust * BaseWeightVIP,
		},
		{
			name: "shadowbanned user (0 weight)",
			user: func() model.User {
				u := veteranUser
				u.IsShadowbanned = true
				return u
			}(),
			want: 0.0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := svc.EffectiveWeight(&tt.user)
			if !almostEqual(got, tt.want, 0.001) {
				t.Errorf("EffectiveWeight() = %.4f, want %.4f", got, tt.want)
			}
		})
	}
}

func TestBaseWeight(t *testing.T) {
	svc := NewTrustService()

	tests := []struct {
		name string
		user model.User
		want float64
	}{
		{"regular", model.User{}, BaseWeightRegular},
		{"VIP", model.User{IsVIP: true}, BaseWeightVIP},
		{"shadowbanned", model.User{IsShadowbanned: true}, BaseWeightShadowbanned},
		{"VIP + shadowbanned (shadowban wins)", model.User{IsVIP: true, IsShadowbanned: true}, BaseWeightShadowbanned},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := svc.BaseWeight(&tt.user)
			if got != tt.want {
				t.Errorf("BaseWeight() = %.1f, want %.1f", got, tt.want)
			}
		})
	}
}
