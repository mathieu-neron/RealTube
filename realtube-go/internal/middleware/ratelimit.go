package middleware

import (
	"fmt"
	"sync"
	"time"

	"github.com/gofiber/fiber/v3"
)

// RateLimitConfig defines the limit for a specific route or group.
type RateLimitConfig struct {
	Max    int           // Maximum requests allowed in the window
	Window time.Duration // Time window for the limit
	KeyFn  func(c fiber.Ctx) string // Returns the key to rate limit on (IP, userID, etc.)
}

// entry tracks request count and window start for a single key.
type entry struct {
	count     int
	windowEnd time.Time
}

// RateLimiter is an in-memory sliding-window rate limiter.
type RateLimiter struct {
	mu      sync.Mutex
	entries map[string]*entry
	config  RateLimitConfig
}

// NewRateLimiter creates a rate limiter with the given config.
func NewRateLimiter(cfg RateLimitConfig) *RateLimiter {
	rl := &RateLimiter{
		entries: make(map[string]*entry),
		config:  cfg,
	}
	// Background cleanup every 5 minutes
	go rl.cleanup()
	return rl
}

// Handler returns a Fiber middleware handler that enforces the rate limit.
func (rl *RateLimiter) Handler() fiber.Handler {
	return func(c fiber.Ctx) error {
		key := rl.config.KeyFn(c)

		rl.mu.Lock()
		now := time.Now()
		e, exists := rl.entries[key]
		if !exists || now.After(e.windowEnd) {
			// New window
			rl.entries[key] = &entry{
				count:     1,
				windowEnd: now.Add(rl.config.Window),
			}
			e = rl.entries[key]
			rl.mu.Unlock()

			setRateLimitHeaders(c, rl.config.Max, rl.config.Max-1, e.windowEnd)
			return c.Next()
		}

		e.count++
		remaining := rl.config.Max - e.count
		rl.mu.Unlock()

		setRateLimitHeaders(c, rl.config.Max, max(remaining, 0), e.windowEnd)

		if remaining < 0 {
			retryAfter := int(time.Until(e.windowEnd).Seconds()) + 1
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error": fiber.Map{
					"code":       "RATE_LIMITED",
					"message":    fmt.Sprintf("Too many requests. Try again in %d seconds.", retryAfter),
					"retryAfter": retryAfter,
				},
			})
		}

		return c.Next()
	}
}

// Allow checks if a request with the given key is allowed (for testing).
func (rl *RateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	e, exists := rl.entries[key]
	if !exists || now.After(e.windowEnd) {
		rl.entries[key] = &entry{
			count:     1,
			windowEnd: now.Add(rl.config.Window),
		}
		return true
	}

	e.count++
	return e.count <= rl.config.Max
}

func setRateLimitHeaders(c fiber.Ctx, limit, remaining int, resetAt time.Time) {
	c.Set("X-RateLimit-Limit", fmt.Sprintf("%d", limit))
	c.Set("X-RateLimit-Remaining", fmt.Sprintf("%d", max(remaining, 0)))
	c.Set("X-RateLimit-Reset", fmt.Sprintf("%d", resetAt.Unix()))
}

func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()
		for key, e := range rl.entries {
			if now.After(e.windowEnd) {
				delete(rl.entries, key)
			}
		}
		rl.mu.Unlock()
	}
}

// KeyByIP returns the client IP as the rate limit key.
func KeyByIP(c fiber.Ctx) string {
	return "ip:" + c.IP()
}

// KeyByUserID extracts the userId from the X-User-ID header or request body.
// Falls back to IP if no userId is available.
func KeyByUserID(c fiber.Ctx) string {
	if uid := c.Get("X-User-ID"); uid != "" {
		return "user:" + uid
	}
	return "ip:" + c.IP()
}

// --- Pre-configured rate limiters matching the API contract ---

// NewVideoRateLimiter: 100 req/min per IP
func NewVideoRateLimiter() *RateLimiter {
	return NewRateLimiter(RateLimitConfig{
		Max:    100,
		Window: time.Minute,
		KeyFn:  KeyByIP,
	})
}

// NewVoteSubmitRateLimiter: 10 req/min per user
func NewVoteSubmitRateLimiter() *RateLimiter {
	return NewRateLimiter(RateLimitConfig{
		Max:    10,
		Window: time.Minute,
		KeyFn:  KeyByUserID,
	})
}

// NewVoteDeleteRateLimiter: 5 req/min per user
func NewVoteDeleteRateLimiter() *RateLimiter {
	return NewRateLimiter(RateLimitConfig{
		Max:    5,
		Window: time.Minute,
		KeyFn:  KeyByUserID,
	})
}

// NewSyncRateLimiter: 2 req/min per user
func NewSyncRateLimiter() *RateLimiter {
	return NewRateLimiter(RateLimitConfig{
		Max:    2,
		Window: time.Minute,
		KeyFn:  KeyByUserID,
	})
}

// NewStatsRateLimiter: 10 req/min per IP
func NewStatsRateLimiter() *RateLimiter {
	return NewRateLimiter(RateLimitConfig{
		Max:    10,
		Window: time.Minute,
		KeyFn:  KeyByIP,
	})
}

// NewExportRateLimiter: 1 req/hour per IP
func NewExportRateLimiter() *RateLimiter {
	return NewRateLimiter(RateLimitConfig{
		Max:    1,
		Window: time.Hour,
		KeyFn:  KeyByIP,
	})
}
