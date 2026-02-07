package handler

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/middleware"
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
		return middleware.ErrorResponse(c, fiber.StatusBadRequest, "INVALID_BODY", "Invalid request body")
	}

	// Validate videoId
	videoID, errMsg := middleware.ValidateVideoID(req.VideoID)
	if errMsg != "" {
		return middleware.ErrorResponse(c, fiber.StatusBadRequest, "INVALID_FIELD", errMsg)
	}
	req.VideoID = videoID

	// Validate userId
	userID, errMsg := middleware.ValidateUserID(req.UserID)
	if errMsg != "" {
		return middleware.ErrorResponse(c, fiber.StatusBadRequest, "INVALID_FIELD", errMsg)
	}
	req.UserID = userID

	// Validate category
	if req.Category == "" {
		return middleware.ErrorResponse(c, fiber.StatusBadRequest, "MISSING_FIELDS", "videoId, userId, and category are required")
	}
	if !repository.ValidCategories[req.Category] {
		return middleware.ErrorResponse(c, fiber.StatusBadRequest, "INVALID_CATEGORY",
			"Invalid category. Must be one of: fully_ai, ai_voiceover, ai_visuals, ai_thumbnails, ai_assisted")
	}

	// Sanitize optional userAgent
	req.UserAgent = middleware.ValidateUserAgent(req.UserAgent)

	// Extract IP for abuse tracking
	ip := c.IP()
	ipHash := ip

	resp, err := h.svc.Submit(c.Context(), req, ipHash)
	if err != nil {
		if strings.Contains(err.Error(), "invalid category") {
			return middleware.ErrorResponse(c, fiber.StatusBadRequest, "INVALID_CATEGORY", err.Error())
		}
		return middleware.ErrorResponse(c, fiber.StatusInternalServerError, "INTERNAL_ERROR", "Failed to submit vote")
	}

	return c.JSON(resp)
}

// Delete handles DELETE /api/votes
func (h *VoteHandler) Delete(c fiber.Ctx) error {
	var req model.VoteDeleteRequest
	if err := c.Bind().JSON(&req); err != nil {
		return middleware.ErrorResponse(c, fiber.StatusBadRequest, "INVALID_BODY", "Invalid request body")
	}

	// Validate videoId
	videoID, errMsg := middleware.ValidateVideoID(req.VideoID)
	if errMsg != "" {
		return middleware.ErrorResponse(c, fiber.StatusBadRequest, "INVALID_FIELD", errMsg)
	}
	req.VideoID = videoID

	// Validate userId
	userID, errMsg := middleware.ValidateUserID(req.UserID)
	if errMsg != "" {
		return middleware.ErrorResponse(c, fiber.StatusBadRequest, "INVALID_FIELD", errMsg)
	}
	req.UserID = userID

	err := h.svc.Delete(c.Context(), req)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return middleware.ErrorResponse(c, fiber.StatusNotFound, "NOT_FOUND", "Vote not found")
		}
		return middleware.ErrorResponse(c, fiber.StatusInternalServerError, "INTERNAL_ERROR", "Failed to delete vote")
	}

	return c.JSON(fiber.Map{"success": true})
}
