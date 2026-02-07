package main

import (
	"context"
	"log"

	"github.com/gofiber/fiber/v3"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/config"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/db"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/handler"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/repository"
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

	// Services
	videoSvc := service.NewVideoService(videoRepo)
	scoreSvc := service.NewScoreService(pool)
	voteSvc := service.NewVoteService(voteRepo, scoreSvc)
	channelSvc := service.NewChannelService(channelRepo)

	// Handlers
	videoHandler := handler.NewVideoHandler(videoSvc)
	voteHandler := handler.NewVoteHandler(voteSvc)
	channelHandler := handler.NewChannelHandler(channelSvc)

	app := fiber.New(fiber.Config{
		AppName:      "RealTube API",
		ServerHeader: "RealTube",
	})

	app.Get("/health/live", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// Video routes
	app.Get("/api/videos/:hashPrefix", videoHandler.GetByHashPrefix)
	app.Get("/api/videos", videoHandler.GetByVideoID)

	// Vote routes
	app.Post("/api/votes", voteHandler.Submit)
	app.Delete("/api/votes", voteHandler.Delete)

	// Channel routes
	app.Get("/api/channels/:channelId", channelHandler.GetByChannelID)

	log.Printf("RealTube Go backend starting on :%s (env=%s)", cfg.Port, cfg.Environment)
	log.Fatal(app.Listen(":" + cfg.Port))
}
