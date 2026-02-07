package middleware

import (
	"testing"
	"time"
)

func TestRateLimiter_AllowsUpToMax(t *testing.T) {
	rl := NewRateLimiter(RateLimitConfig{
		Max:    5,
		Window: time.Minute,
		KeyFn:  KeyByIP,
	})

	for i := 0; i < 5; i++ {
		if !rl.Allow("test-ip") {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}
}

func TestRateLimiter_BlocksAfterMax(t *testing.T) {
	rl := NewRateLimiter(RateLimitConfig{
		Max:    3,
		Window: time.Minute,
		KeyFn:  KeyByIP,
	})

	for i := 0; i < 3; i++ {
		rl.Allow("test-ip")
	}

	if rl.Allow("test-ip") {
		t.Fatal("4th request should be blocked")
	}
}

func TestRateLimiter_DifferentKeysIndependent(t *testing.T) {
	rl := NewRateLimiter(RateLimitConfig{
		Max:    2,
		Window: time.Minute,
		KeyFn:  KeyByIP,
	})

	rl.Allow("ip-a")
	rl.Allow("ip-a")

	// ip-a is exhausted
	if rl.Allow("ip-a") {
		t.Fatal("ip-a should be blocked")
	}

	// ip-b should still be allowed
	if !rl.Allow("ip-b") {
		t.Fatal("ip-b should be allowed (independent key)")
	}
}

func TestRateLimiter_WindowResets(t *testing.T) {
	rl := NewRateLimiter(RateLimitConfig{
		Max:    2,
		Window: 50 * time.Millisecond,
		KeyFn:  KeyByIP,
	})

	rl.Allow("test")
	rl.Allow("test")

	if rl.Allow("test") {
		t.Fatal("should be blocked within window")
	}

	// Wait for window to expire
	time.Sleep(60 * time.Millisecond)

	if !rl.Allow("test") {
		t.Fatal("should be allowed after window reset")
	}
}

func TestRateLimiter_VoteSubmitConfig(t *testing.T) {
	rl := NewVoteSubmitRateLimiter()
	// Should allow up to 10
	for i := 0; i < 10; i++ {
		if !rl.Allow("user:abc123") {
			t.Fatalf("vote submit request %d should be allowed (max 10)", i+1)
		}
	}
	if rl.Allow("user:abc123") {
		t.Fatal("11th vote submit should be blocked")
	}
}

func TestRateLimiter_VoteDeleteConfig(t *testing.T) {
	rl := NewVoteDeleteRateLimiter()
	for i := 0; i < 5; i++ {
		if !rl.Allow("user:abc123") {
			t.Fatalf("vote delete request %d should be allowed (max 5)", i+1)
		}
	}
	if rl.Allow("user:abc123") {
		t.Fatal("6th vote delete should be blocked")
	}
}

func TestRateLimiter_SyncConfig(t *testing.T) {
	rl := NewSyncRateLimiter()
	for i := 0; i < 2; i++ {
		if !rl.Allow("user:abc123") {
			t.Fatalf("sync request %d should be allowed (max 2)", i+1)
		}
	}
	if rl.Allow("user:abc123") {
		t.Fatal("3rd sync request should be blocked")
	}
}

func TestRateLimiter_StatsConfig(t *testing.T) {
	rl := NewStatsRateLimiter()
	for i := 0; i < 10; i++ {
		if !rl.Allow("ip:127.0.0.1") {
			t.Fatalf("stats request %d should be allowed (max 10)", i+1)
		}
	}
	if rl.Allow("ip:127.0.0.1") {
		t.Fatal("11th stats request should be blocked")
	}
}

func TestRateLimiter_ExportConfig(t *testing.T) {
	rl := NewExportRateLimiter()
	if !rl.Allow("ip:127.0.0.1") {
		t.Fatal("1st export request should be allowed")
	}
	if rl.Allow("ip:127.0.0.1") {
		t.Fatal("2nd export request should be blocked (max 1/hour)")
	}
}
