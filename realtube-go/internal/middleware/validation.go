package middleware

import (
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v3"
)

// Field length limits matching database schema constraints.
const (
	MaxVideoIDLen   = 16  // videos.video_id VARCHAR(16)
	MaxChannelIDLen = 32  // channels.channel_id VARCHAR(32)
	MaxUserIDLen    = 64  // users.user_id VARCHAR(64)
	MaxUserAgentLen = 128 // votes.user_agent VARCHAR(128)
	MaxCategoryLen  = 20  // video_categories.category VARCHAR(20)
	MinHashPrefix   = 4
	MaxHashPrefix   = 8
)

var (
	// videoIDRe matches YouTube video IDs: alphanumeric, dash, underscore.
	videoIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
	// hexRe matches lowercase hex strings (SHA256 hash prefix or full hash).
	hexRe = regexp.MustCompile(`^[0-9a-f]+$`)
	// channelIDRe matches YouTube channel IDs: starts with UC, alphanumeric, dash, underscore.
	channelIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
	// userIDRe matches user IDs: hex SHA256 hashes (64 chars) or shorter hashed IDs.
	userIDRe = regexp.MustCompile(`^[0-9a-f]+$`)
)

// ErrorResponse is a helper that returns a standard API error response.
func ErrorResponse(c fiber.Ctx, status int, code, message string) error {
	return c.Status(status).JSON(fiber.Map{
		"error": fiber.Map{
			"code":    code,
			"message": message,
		},
	})
}

// ValidateVideoID checks that a video ID is well-formed and within DB limits.
func ValidateVideoID(id string) (string, string) {
	id = strings.TrimSpace(id)
	if id == "" {
		return "", "videoId is required"
	}
	if len(id) > MaxVideoIDLen {
		return "", "videoId must be at most 16 characters"
	}
	if !videoIDRe.MatchString(id) {
		return "", "videoId contains invalid characters"
	}
	return id, ""
}

// ValidateHashPrefix checks the hash prefix format.
func ValidateHashPrefix(prefix string) (string, string) {
	prefix = strings.TrimSpace(strings.ToLower(prefix))
	if len(prefix) < MinHashPrefix || len(prefix) > MaxHashPrefix {
		return "", "Hash prefix must be 4-8 characters"
	}
	if !hexRe.MatchString(prefix) {
		return "", "Hash prefix must be hexadecimal"
	}
	return prefix, ""
}

// ValidateChannelID checks that a channel ID is well-formed.
func ValidateChannelID(id string) (string, string) {
	id = strings.TrimSpace(id)
	if id == "" {
		return "", "channelId is required"
	}
	if len(id) > MaxChannelIDLen {
		return "", "channelId must be at most 32 characters"
	}
	if !channelIDRe.MatchString(id) {
		return "", "channelId contains invalid characters"
	}
	return id, ""
}

// ValidateUserID checks that a user ID is a valid hex hash.
func ValidateUserID(id string) (string, string) {
	id = strings.TrimSpace(strings.ToLower(id))
	if id == "" {
		return "", "userId is required"
	}
	if len(id) > MaxUserIDLen {
		return "", "userId must be at most 64 characters"
	}
	if !userIDRe.MatchString(id) {
		return "", "userId must be a hexadecimal hash"
	}
	return id, ""
}

// ValidateUserAgent trims and truncates user agent to DB limits.
func ValidateUserAgent(ua string) string {
	ua = strings.TrimSpace(ua)
	if len(ua) > MaxUserAgentLen {
		ua = ua[:MaxUserAgentLen]
	}
	return ua
}
