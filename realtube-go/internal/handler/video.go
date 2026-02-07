package handler

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"

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
	prefix := c.Params("hashPrefix")
	if len(prefix) < 4 || len(prefix) > 8 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "INVALID_PREFIX",
				"message": "Hash prefix must be 4-8 characters",
			},
		})
	}

	videos, err := h.svc.LookupByHashPrefix(c.Context(), prefix)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "INTERNAL_ERROR",
				"message": "Failed to lookup videos",
			},
		})
	}

	if len(videos) == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "NOT_FOUND",
				"message": "No flagged videos matching prefix",
			},
		})
	}

	return c.JSON(videos)
}

// GetByVideoID handles GET /api/videos?videoId=X
func (h *VideoHandler) GetByVideoID(c fiber.Ctx) error {
	videoID := fiber.Query[string](c, "videoId")
	if videoID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "MISSING_PARAM",
				"message": "videoId query parameter is required",
			},
		})
	}

	video, err := h.svc.LookupByVideoID(c.Context(), videoID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": fiber.Map{
					"code":    "NOT_FOUND",
					"message": "Video not found",
				},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "INTERNAL_ERROR",
				"message": "Failed to lookup video",
			},
		})
	}

	return c.JSON(video)
}
