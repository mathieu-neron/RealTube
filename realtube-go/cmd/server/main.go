package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v3"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/config"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/db"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/handler"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/middleware"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/repository"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/router"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/service"
)

func main() {
	cfg := config.Load()

	// Initialize structured logger (must be first)
	middleware.InitLogger(cfg.LogLevel, "realtube-go")
	log := middleware.Logger

	ctx := context.Background()
	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to database")
	}

	// Redis cache (graceful degradation — runs without Redis)
	cacheSvc := service.NewCacheService(cfg.RedisURL)

	// Repositories
	videoRepo := repository.NewVideoRepo(pool)
	voteRepo := repository.NewVoteRepo(pool)
	channelRepo := repository.NewChannelRepo(pool)
	userRepo := repository.NewUserRepo(pool)

	// Services
	videoSvc := service.NewVideoService(videoRepo, cacheSvc)
	scoreSvc := service.NewScoreService(pool)
	voteSvc := service.NewVoteService(voteRepo, cacheSvc)
	channelSvc := service.NewChannelService(channelRepo, cacheSvc)
	userSvc := service.NewUserService(userRepo)
	syncSvc := service.NewSyncService(pool, videoSvc, channelSvc)

	// Initialize Prometheus metrics
	handler.InitMetrics(pool)

	// Handlers
	handlers := &router.Handlers{
		Video:   handler.NewVideoHandler(videoSvc),
		Vote:    handler.NewVoteHandler(voteSvc),
		Channel: handler.NewChannelHandler(channelSvc),
		User:    handler.NewUserHandler(userSvc),
		Stats:   handler.NewStatsHandler(userSvc),
		Sync:    handler.NewSyncHandler(syncSvc),
		Health:  handler.NewHealthHandler(pool, cacheSvc.Client()),
		Export:  handler.NewExportHandler(cfg.ExportDir),
	}

	app := fiber.New(fiber.Config{
		AppName:      "RealTube API",
		ServerHeader: "RealTube",
		// Trusted proxy: NGINX sits in front, forwarding client IP via X-Forwarded-For.
		// Without this, attackers can spoof IPs to bypass rate limiting.
		TrustProxy:   true,
		ProxyHeader:  "X-Real-IP",
		TrustProxyConfig: fiber.TrustProxyConfig{
			Proxies: []string{"172.16.0.0/12"}, // Docker internal network
		},
	})

	router.Setup(app, handlers, cfg.CORSOrigins)

	// Graceful shutdown: listen for SIGTERM/SIGINT
	shutdownCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Start background workers
	channelWorker := service.NewChannelWorker(pool, 15*time.Minute)
	go channelWorker.Start(shutdownCtx)

	scoreWorker := service.NewScoreWorker(pool, scoreSvc, cacheSvc)
	go scoreWorker.Start(shutdownCtx)

	// Start server in a goroutine
	go func() {
		log.Info().
			Str("port", cfg.Port).
			Str("environment", cfg.Environment).
			Str("log_level", cfg.LogLevel).
			Msg("server starting")
		if err := app.Listen(":" + cfg.Port); err != nil {
			log.Fatal().Err(err).Msg("server error")
		}
	}()

	// Block until shutdown signal
	<-shutdownCtx.Done()
	log.Info().Msg("shutdown signal received, draining connections")

	// Give in-flight requests 30 seconds to complete
	timeoutCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := app.ShutdownWithContext(timeoutCtx); err != nil {
		log.Error().Err(err).Msg("server shutdown error")
	} else {
		log.Info().Msg("server stopped accepting connections")
	}

	// Close Redis
	if err := cacheSvc.Close(); err != nil {
		log.Error().Err(err).Msg("redis close error")
	} else {
		log.Info().Msg("redis connection closed")
	}

	// Close database pool
	pool.Close()
	log.Info().Msg("database pool closed")

	log.Info().Msg("graceful shutdown complete")
}
