package handler

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/middleware"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/service"
)

type VideoHandler struct {
	svc *service.VideoService
}

func NewVideoHandler(svc *service.VideoService) *VideoHandler {
	return &VideoHandler{svc: svc}
}

// GetByHashPrefix handles GET /api/videos/:hashPrefix
func (h *VideoHandler) GetByHashPrefix(c fiber.Ctx) error {
	prefix, errMsg := middleware.ValidateHashPrefix(c.Params("hashPrefix"))
	if errMsg != "" {
		return middleware.ErrorResponse(c, fiber.StatusBadRequest, "INVALID_PREFIX", errMsg)
	}

	videos, err := h.svc.LookupByHashPrefix(c.Context(), prefix)
	if err != nil {
		return middleware.ErrorResponse(c, fiber.StatusInternalServerError, "INTERNAL_ERROR", "Failed to lookup videos")
	}

	if len(videos) == 0 {
		return middleware.ErrorResponse(c, fiber.StatusNotFound, "NOT_FOUND", "No flagged videos matching prefix")
	}

	return c.JSON(videos)
}

// GetByVideoID handles GET /api/videos?videoId=X
func (h *VideoHandler) GetByVideoID(c fiber.Ctx) error {
	videoID, errMsg := middleware.ValidateVideoID(fiber.Query[string](c, "videoId"))
	if errMsg != "" {
		return middleware.ErrorResponse(c, fiber.StatusBadRequest, "INVALID_FIELD", errMsg)
	}

	video, err := h.svc.LookupByVideoID(c.Context(), videoID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return middleware.ErrorResponse(c, fiber.StatusNotFound, "NOT_FOUND", "Video not found")
		}
		return middleware.ErrorResponse(c, fiber.StatusInternalServerError, "INTERNAL_ERROR", "Failed to lookup video")
	}

	return c.JSON(video)
}
