package main

import (
	"context"
	"log"

	"github.com/gofiber/fiber/v3"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/config"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/db"
)

func main() {
	cfg := config.Load()

	ctx := context.Background()
	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer pool.Close()

	app := fiber.New(fiber.Config{
		AppName:      "RealTube API",
		ServerHeader: "RealTube",
	})

	app.Get("/health/live", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	log.Printf("RealTube Go backend starting on :%s (env=%s)", cfg.Port, cfg.Environment)
	log.Fatal(app.Listen(":" + cfg.Port))
}
