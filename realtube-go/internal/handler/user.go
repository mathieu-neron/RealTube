package handler

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/middleware"
	"github.com/mathieu-neron/RealTube/realtube-go/internal/service"
)

type UserHandler struct {
	svc *service.UserService
}

func NewUserHandler(svc *service.UserService) *UserHandler {
	return &UserHandler{svc: svc}
}

// GetByUserID handles GET /api/users/:userId
func (h *UserHandler) GetByUserID(c fiber.Ctx) error {
	userID, errMsg := middleware.ValidateUserID(c.Params("userId"))
	if errMsg != "" {
		return middleware.ErrorResponse(c, fiber.StatusBadRequest, "INVALID_FIELD", errMsg)
	}

	resp, err := h.svc.Lookup(c.Context(), userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return middleware.ErrorResponse(c, fiber.StatusNotFound, "NOT_FOUND", "User not found")
		}
		return middleware.ErrorResponse(c, fiber.StatusInternalServerError, "INTERNAL_ERROR", "Failed to lookup user")
	}

	return c.JSON(resp)
}
