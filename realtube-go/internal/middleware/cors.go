package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
)

// NewCORS returns a CORS middleware configured for RealTube.
// corsOrigins is a comma-separated list of allowed origins (e.g. "chrome-extension://abc,https://localhost").
// Supports scheme-prefix patterns like "chrome-extension://*" and "moz-extension://*"
// which match any origin starting with that scheme.
// Use "*" to allow all origins (development default).
func NewCORS(corsOrigins string) fiber.Handler {
	if corsOrigins == "" || corsOrigins == "*" {
		return cors.New(cors.Config{
			AllowOrigins: []string{"*"},
			AllowMethods: corsMethods(),
			AllowHeaders: corsHeaders(),
			ExposeHeaders: corsExposeHeaders(),
			MaxAge: 86400,
		})
	}

	// Parse origins into exact origins and wildcard patterns.
	// Exact origins go into AllowOrigins; patterns use AllowOriginsFunc.
	// Pattern types:
	//   "chrome-extension://*" → matches any origin starting with "chrome-extension://"
	//   "http://localhost:*"   → matches any origin starting with "http://localhost:"
	var exactOrigins []string
	var prefixPatterns []string

	for _, o := range strings.Split(corsOrigins, ",") {
		o = strings.TrimSpace(o)
		if o == "" {
			continue
		}
		if strings.HasSuffix(o, "*") {
			prefixPatterns = append(prefixPatterns, strings.TrimSuffix(o, "*"))
		} else {
			exactOrigins = append(exactOrigins, o)
		}
	}

	// AllowOriginsFunc handles all matching (both exact and pattern).
	// We avoid AllowOrigins entirely to prevent Fiber's strict format validation
	// from rejecting non-standard schemes like chrome-extension://.
	return cors.New(cors.Config{
		AllowOriginsFunc: func(origin string) bool {
			for _, exact := range exactOrigins {
				if origin == exact {
					return true
				}
			}
			for _, prefix := range prefixPatterns {
				if strings.HasPrefix(origin, prefix) {
					return true
				}
			}
			return false
		},
		AllowMethods:  corsMethods(),
		AllowHeaders:  corsHeaders(),
		ExposeHeaders: corsExposeHeaders(),
		MaxAge:        86400,
	})
}

func corsMethods() []string {
	return []string{
		fiber.MethodGet,
		fiber.MethodPost,
		fiber.MethodDelete,
		fiber.MethodOptions,
	}
}

func corsHeaders() []string {
	return []string{
		"Origin",
		"Content-Type",
		"Accept",
		"X-User-ID",
	}
}

func corsExposeHeaders() []string {
	return []string{
		"X-RateLimit-Limit",
		"X-RateLimit-Remaining",
		"X-RateLimit-Reset",
	}
}
