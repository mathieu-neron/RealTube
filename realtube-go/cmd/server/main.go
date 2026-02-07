package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v3"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/config"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/db"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/handler"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/repository"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/router"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/service"
)

func main() {
	cfg := config.Load()

	ctx := context.Background()
	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
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
	voteSvc := service.NewVoteService(voteRepo, scoreSvc, cacheSvc)
	channelSvc := service.NewChannelService(channelRepo, cacheSvc)
	userSvc := service.NewUserService(userRepo)
	syncSvc := service.NewSyncService(pool, videoSvc, channelSvc)

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
	})

	router.Setup(app, handlers, cfg.CORSOrigins)

	// Graceful shutdown: listen for SIGTERM/SIGINT
	shutdownCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Start server in a goroutine
	go func() {
		log.Printf("RealTube Go backend starting on :%s (env=%s)", cfg.Port, cfg.Environment)
		if err := app.Listen(":" + cfg.Port); err != nil {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Block until shutdown signal
	<-shutdownCtx.Done()
	log.Println("shutdown signal received, draining connections...")

	// Give in-flight requests 30 seconds to complete
	timeoutCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := app.ShutdownWithContext(timeoutCtx); err != nil {
		log.Printf("server shutdown error: %v", err)
	} else {
		log.Println("server stopped accepting connections")
	}

	// Close Redis
	if err := cacheSvc.Close(); err != nil {
		log.Printf("redis close error: %v", err)
	} else {
		log.Println("redis connection closed")
	}

	// Close database pool
	pool.Close()
	log.Println("database pool closed")

	log.Println("graceful shutdown complete")
}
