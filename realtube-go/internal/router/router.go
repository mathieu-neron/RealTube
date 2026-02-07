package router

import (
	"github.com/gofiber/fiber/v3"
	recoverer "github.com/gofiber/fiber/v3/middleware/recover"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/handler"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/middleware"
)

// Handlers holds all handler instances needed by the router.
type Handlers struct {
	Video   *handler.VideoHandler
	Vote    *handler.VoteHandler
	Channel *handler.ChannelHandler
	User    *handler.UserHandler
	Stats   *handler.StatsHandler
	Sync    *handler.SyncHandler
}

// Setup configures the middleware stack and all API routes on the given Fiber app.
func Setup(app *fiber.App, h *Handlers, corsOrigins string) {
	// Middleware stack (order matters)
	app.Use(recoverer.New())
	app.Use(middleware.NewRequestLogger())
	app.Use(middleware.NewCORS(corsOrigins))

	// Health check (before API group, no auth needed)
	app.Get("/health/live", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// API routes
	api := app.Group("/api")

	// Video routes
	api.Get("/videos/:hashPrefix", h.Video.GetByHashPrefix)
	api.Get("/videos", h.Video.GetByVideoID)

	// Vote routes
	api.Post("/votes", h.Vote.Submit)
	api.Delete("/votes", h.Vote.Delete)

	// Channel routes
	api.Get("/channels/:channelId", h.Channel.GetByChannelID)

	// User routes
	api.Get("/users/:userId", h.User.GetByUserID)

	// Stats routes
	api.Get("/stats", h.Stats.GetStats)

	// Sync routes
	api.Get("/sync/delta", h.Sync.DeltaSync)
	api.Get("/sync/full", h.Sync.FullSync)
}
