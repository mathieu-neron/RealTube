package handler

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/service"
)

type ChannelHandler struct {
	svc *service.ChannelService
}

func NewChannelHandler(svc *service.ChannelService) *ChannelHandler {
	return &ChannelHandler{svc: svc}
}

// GetByChannelID handles GET /api/channels/:channelId
func (h *ChannelHandler) GetByChannelID(c fiber.Ctx) error {
	channelID := c.Params("channelId")
	if channelID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "MISSING_PARAM",
				"message": "channelId path parameter is required",
			},
		})
	}

	resp, err := h.svc.Lookup(c.Context(), channelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": fiber.Map{
					"code":    "NOT_FOUND",
					"message": "Channel not found",
				},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "INTERNAL_ERROR",
				"message": "Failed to lookup channel",
			},
		})
	}

	return c.JSON(resp)
}
