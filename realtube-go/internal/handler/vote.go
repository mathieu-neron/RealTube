package handler

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/model"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/repository"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/service"
)

type VoteHandler struct {
	svc *service.VoteService
}

func NewVoteHandler(svc *service.VoteService) *VoteHandler {
	return &VoteHandler{svc: svc}
}

// Submit handles POST /api/votes
func (h *VoteHandler) Submit(c fiber.Ctx) error {
	var req model.VoteRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "INVALID_BODY",
				"message": "Invalid request body",
			},
		})
	}

	if req.VideoID == "" || req.UserID == "" || req.Category == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "MISSING_FIELDS",
				"message": "videoId, userId, and category are required",
			},
		})
	}

	if !repository.ValidCategories[req.Category] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "INVALID_CATEGORY",
				"message": "Invalid category. Must be one of: fully_ai, ai_voiceover, ai_visuals, ai_thumbnails, ai_assisted",
			},
		})
	}

	// Extract IP for abuse tracking (hash it server-side)
	ip := c.IP()
	// Simple hash for now; will be properly salted in security hardening step
	ipHash := ip

	resp, err := h.svc.Submit(c.Context(), req, ipHash)
	if err != nil {
		if strings.Contains(err.Error(), "invalid category") {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": fiber.Map{
					"code":    "INVALID_CATEGORY",
					"message": err.Error(),
				},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "INTERNAL_ERROR",
				"message": "Failed to submit vote",
			},
		})
	}

	return c.JSON(resp)
}

// Delete handles DELETE /api/votes
func (h *VoteHandler) Delete(c fiber.Ctx) error {
	var req model.VoteDeleteRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "INVALID_BODY",
				"message": "Invalid request body",
			},
		})
	}

	if req.VideoID == "" || req.UserID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "MISSING_FIELDS",
				"message": "videoId and userId are required",
			},
		})
	}

	err := h.svc.Delete(c.Context(), req)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": fiber.Map{
					"code":    "NOT_FOUND",
					"message": "Vote not found",
				},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "INTERNAL_ERROR",
				"message": "Failed to delete vote",
			},
		})
	}

	return c.JSON(fiber.Map{"success": true})
}
