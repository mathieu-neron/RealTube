package handler

import (
	"github.com/gofiber/fiber/v3"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/middleware"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/service"
)

type StatsHandler struct {
	svc *service.UserService
}

func NewStatsHandler(svc *service.UserService) *StatsHandler {
	return &StatsHandler{svc: svc}
}

// GetStats handles GET /api/stats
func (h *StatsHandler) GetStats(c fiber.Ctx) error {
	stats, err := h.svc.GetStats(c.Context())
	if err != nil {
		return middleware.ErrorResponse(c, fiber.StatusInternalServerError, "INTERNAL_ERROR", "Failed to fetch statistics")
	}

	return c.JSON(stats)
}
