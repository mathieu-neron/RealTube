package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
)

// Logger is the package-level zerolog logger used throughout the application.
var Logger zerolog.Logger

// InitLogger sets up the global zerolog logger with structured JSON output.
// Level is parsed from the given string (e.g. "debug", "info", "warn", "error").
func InitLogger(level, service string) {
	lvl, err := zerolog.ParseLevel(level)
	if err != nil {
		lvl = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(lvl)

	zerolog.TimeFieldFormat = time.RFC3339Nano
	zerolog.DurationFieldUnit = time.Millisecond
	zerolog.DurationFieldInteger = true

	Logger = zerolog.New(os.Stdout).With().
		Timestamp().
		Str("service", service).
		Logger()
}

// hashIPForLog produces a short, irreversible hash prefix of the IP address
// for log correlation without storing raw PII.
func hashIPForLog(ip string) string {
	h := sha256.Sum256([]byte(ip))
	return hex.EncodeToString(h[:])[:12]
}

// sanitizePath replaces dynamic path segments (user IDs, channel IDs, hash
// prefixes) with placeholders so PII is never written to logs.
func sanitizePath(path string) string {
	parts := strings.Split(path, "/")
	for i := range parts {
		if i == 0 {
			continue
		}
		prev := parts[i-1]
		switch prev {
		case "users":
			parts[i] = ":userId"
		case "channels":
			parts[i] = ":channelId"
		case "videos":
			// Hash prefix segment — safe to keep (already a prefix),
			// but redact for consistency.
			parts[i] = ":hashPrefix"
		}
	}
	return strings.Join(parts, "/")
}

// NewRequestLogger returns a Fiber middleware that logs each request as
// structured JSON via zerolog, matching the design doc format (section 22).
// Privacy: raw IPs are hashed; dynamic path segments are sanitized.
func NewRequestLogger() fiber.Handler {
	return func(c fiber.Ctx) error {
		start := time.Now()

		err := c.Next()

		duration := time.Since(start)
		status := c.Response().StatusCode()

		evt := Logger.Info()
		if status >= 500 {
			evt = Logger.Error()
		} else if status >= 400 {
			evt = Logger.Warn()
		}

		evt.
			Str("method", c.Method()).
			Str("path", sanitizePath(c.Path())).
			Int("status", status).
			Dur("duration_ms", duration).
			Str("ip_hash", hashIPForLog(c.IP())).
			Int("bytes_sent", len(c.Response().Body())).
			Msg("request")

		return err
	}
}
