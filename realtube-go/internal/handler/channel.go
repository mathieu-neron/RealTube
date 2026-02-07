package handler

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/middleware"
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
	channelID, errMsg := middleware.ValidateChannelID(c.Params("channelId"))
	if errMsg != "" {
		return middleware.ErrorResponse(c, fiber.StatusBadRequest, "INVALID_FIELD", errMsg)
	}

	resp, err := h.svc.Lookup(c.Context(), channelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return middleware.ErrorResponse(c, fiber.StatusNotFound, "NOT_FOUND", "Channel not found")
		}
		return middleware.ErrorResponse(c, fiber.StatusInternalServerError, "INTERNAL_ERROR", "Failed to lookup channel")
	}

	return c.JSON(resp)
}
