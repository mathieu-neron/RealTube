package handler

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type HealthHandler struct {
	pool    *pgxpool.Pool
	rdb     *redis.Client
	startAt time.Time
}

func NewHealthHandler(pool *pgxpool.Pool, rdb *redis.Client) *HealthHandler {
	return &HealthHandler{
		pool:    pool,
		rdb:     rdb,
		startAt: time.Now(),
	}
}

// Live handles GET /health/live — liveness probe.
func (h *HealthHandler) Live(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "ok"})
}

// Ready handles GET /health/ready — readiness probe with dependency checks.
func (h *HealthHandler) Ready(c fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	checks := make(fiber.Map)
	overallStatus := "healthy"

	// Database check
	checks["database"] = checkDB(ctx, h.pool)
	if dbCheck, ok := checks["database"].(fiber.Map); ok {
		if dbCheck["status"] != "up" {
			overallStatus = "degraded"
		}
	}

	// Redis check
	checks["redis"] = checkRedis(ctx, h.rdb)
	if redisCheck, ok := checks["redis"].(fiber.Map); ok {
		if redisCheck["status"] != "up" && overallStatus == "healthy" {
			overallStatus = "degraded"
		}
	}

	uptimeSeconds := int(time.Since(h.startAt).Seconds())

	resp := fiber.Map{
		"status":         overallStatus,
		"checks":         checks,
		"uptime_seconds": uptimeSeconds,
		"version":        "1.0.0",
	}

	status := fiber.StatusOK
	if overallStatus != "healthy" {
		status = fiber.StatusServiceUnavailable
	}

	return c.Status(status).JSON(resp)
}

func checkDB(ctx context.Context, pool *pgxpool.Pool) fiber.Map {
	start := time.Now()
	err := pool.Ping(ctx)
	latency := time.Since(start).Milliseconds()

	if err != nil {
		return fiber.Map{
			"status":     "down",
			"latency_ms": latency,
			"error":      "connection failed",
		}
	}
	return fiber.Map{
		"status":     "up",
		"latency_ms": latency,
	}
}

func checkRedis(ctx context.Context, rdb *redis.Client) fiber.Map {
	if rdb == nil {
		return fiber.Map{
			"status": "disabled",
		}
	}

	start := time.Now()
	err := rdb.Ping(ctx).Err()
	latency := time.Since(start).Milliseconds()

	if err != nil {
		return fiber.Map{
			"status":     "down",
			"latency_ms": latency,
			"error":      "connection failed",
		}
	}
	return fiber.Map{
		"status":     "up",
		"latency_ms": latency,
	}
}
