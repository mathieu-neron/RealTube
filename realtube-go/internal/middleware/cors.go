package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
)

// NewCORS returns a CORS middleware configured for RealTube.
// corsOrigins is a comma-separated list of allowed origins (e.g. "chrome-extension://xxx,moz-extension://xxx").
// Use "*" to allow all origins (development default).
func NewCORS(corsOrigins string) fiber.Handler {
	origins := []string{"*"}
	if corsOrigins != "" && corsOrigins != "*" {
		origins = strings.Split(corsOrigins, ",")
		for i, o := range origins {
			origins[i] = strings.TrimSpace(o)
		}
	}

	return cors.New(cors.Config{
		AllowOrigins: origins,
		AllowMethods: []string{
			fiber.MethodGet,
			fiber.MethodPost,
			fiber.MethodDelete,
			fiber.MethodOptions,
		},
		AllowHeaders: []string{
			"Origin",
			"Content-Type",
			"Accept",
			"X-User-ID",
		},
		ExposeHeaders: []string{
			"X-RateLimit-Limit",
			"X-RateLimit-Remaining",
			"X-RateLimit-Reset",
		},
		MaxAge: 86400,
	})
}
