package handler

import (
	"time"

	"github.com/gofiber/fiber/v3"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/service"
)

type SyncHandler struct {
	svc *service.SyncService
}

func NewSyncHandler(svc *service.SyncService) *SyncHandler {
	return &SyncHandler{svc: svc}
}

// DeltaSync handles GET /api/sync/delta?since=TIMESTAMP
func (h *SyncHandler) DeltaSync(c fiber.Ctx) error {
	sinceStr := fiber.Query[string](c, "since")
	if sinceStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "MISSING_PARAM",
				"message": "since query parameter is required (RFC3339 timestamp)",
			},
		})
	}

	since, err := time.Parse(time.RFC3339, sinceStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "INVALID_PARAM",
				"message": "since must be a valid RFC3339 timestamp",
			},
		})
	}

	resp, err := h.svc.DeltaSync(c.Context(), since)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "INTERNAL_ERROR",
				"message": "Failed to fetch delta sync",
			},
		})
	}

	return c.JSON(resp)
}

// FullSync handles GET /api/sync/full
func (h *SyncHandler) FullSync(c fiber.Ctx) error {
	resp, err := h.svc.FullSync(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "INTERNAL_ERROR",
				"message": "Failed to fetch full sync",
			},
		})
	}

	return c.JSON(resp)
}
