package middleware

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/logger"
)

// NewRequestLogger returns a request logging middleware that outputs
// structured-ish log lines for each request.
func NewRequestLogger() fiber.Handler {
	return logger.New(logger.Config{
		Format:     "${time} ${status} ${method} ${path} ${latency} ${ip} ${bytesSent}b\n",
		TimeFormat: "2006-01-02T15:04:05.000Z07:00",
	})
}
