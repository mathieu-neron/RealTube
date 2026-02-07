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

	// Rate limiters (per-route, matching api-contract.md §5.3)
	videoRL := middleware.NewVideoRateLimiter()
	voteSubmitRL := middleware.NewVoteSubmitRateLimiter()
	voteDeleteRL := middleware.NewVoteDeleteRateLimiter()
	syncRL := middleware.NewSyncRateLimiter()
	statsRL := middleware.NewStatsRateLimiter()

	// Health check (before API group, no rate limiting)
	app.Get("/health/live", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// API routes
	api := app.Group("/api")

	// Video routes — 100 req/min per IP
	api.Get("/videos/:hashPrefix", videoRL.Handler(), h.Video.GetByHashPrefix)
	api.Get("/videos", videoRL.Handler(), h.Video.GetByVideoID)

	// Vote routes — per-user limits
	api.Post("/votes", voteSubmitRL.Handler(), h.Vote.Submit)
	api.Delete("/votes", voteDeleteRL.Handler(), h.Vote.Delete)

	// Channel routes — same limits as video
	api.Get("/channels/:channelId", videoRL.Handler(), h.Channel.GetByChannelID)

	// User routes — same limits as video
	api.Get("/users/:userId", videoRL.Handler(), h.User.GetByUserID)

	// Stats routes — 10 req/min per IP
	api.Get("/stats", statsRL.Handler(), h.Stats.GetStats)

	// Sync routes — 2 req/min per user
	api.Get("/sync/delta", syncRL.Handler(), h.Sync.DeltaSync)
	api.Get("/sync/full", syncRL.Handler(), h.Sync.FullSync)
}
