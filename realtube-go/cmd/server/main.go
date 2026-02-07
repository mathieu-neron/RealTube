package main

import (
	"context"
	"log"

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
	defer pool.Close()

	// Repositories
	videoRepo := repository.NewVideoRepo(pool)
	voteRepo := repository.NewVoteRepo(pool)
	channelRepo := repository.NewChannelRepo(pool)
	userRepo := repository.NewUserRepo(pool)

	// Services
	videoSvc := service.NewVideoService(videoRepo)
	scoreSvc := service.NewScoreService(pool)
	voteSvc := service.NewVoteService(voteRepo, scoreSvc)
	channelSvc := service.NewChannelService(channelRepo)
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
	}

	app := fiber.New(fiber.Config{
		AppName:      "RealTube API",
		ServerHeader: "RealTube",
	})

	router.Setup(app, handlers, cfg.CORSOrigins)

	log.Printf("RealTube Go backend starting on :%s (env=%s)", cfg.Port, cfg.Environment)
	log.Fatal(app.Listen(":" + cfg.Port))
}
