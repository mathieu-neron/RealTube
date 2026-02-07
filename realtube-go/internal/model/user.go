package model

import "time"

// User represents a RealTube user with trust metadata.
type User struct {
	UserID        string    `json:"userId"`
	TrustScore    float64   `json:"trustScore"`
	AccuracyRate  float64   `json:"accuracyRate"`
	TotalVotes    int       `json:"totalVotes"`
	AccurateVotes int       `json:"-"`
	FirstSeen     time.Time `json:"-"`
	LastActive    time.Time `json:"-"`
	IsVIP         bool      `json:"isVip"`
	IsShadowbanned bool    `json:"-"`
	BanReason     string    `json:"-"`
	Username      string    `json:"username,omitempty"`
}

// UserResponse is the API response for user info.
type UserResponse struct {
	UserID       string  `json:"userId"`
	TrustScore   float64 `json:"trustScore"`
	TotalVotes   int     `json:"totalVotes"`
	AccuracyRate float64 `json:"accuracyRate"`
	AccountAge   int     `json:"accountAge"`
	IsVIP        bool    `json:"isVip"`
}

// StatsResponse is the API response for global statistics.
type StatsResponse struct {
	TotalVideos    int            `json:"totalVideos"`
	TotalChannels  int            `json:"totalChannels"`
	TotalVotes     int            `json:"totalVotes"`
	TotalUsers     int            `json:"totalUsers"`
	ActiveUsers24h int            `json:"activeUsers24h"`
	TopCategories  map[string]int `json:"topCategories"`
}

// SyncResponse is the API response for delta/full sync.
type SyncDeltaResponse struct {
	Videos        []SyncVideoEntry   `json:"videos"`
	Channels      []SyncChannelEntry `json:"channels"`
	SyncTimestamp string             `json:"syncTimestamp"`
}

// SyncVideoEntry represents a video change in a sync response.
type SyncVideoEntry struct {
	VideoID    string                     `json:"videoId"`
	Score      float64                    `json:"score,omitempty"`
	Categories map[string]*CategoryDetail `json:"categories,omitempty"`
	Action     string                     `json:"action"`
}

// SyncChannelEntry represents a channel change in a sync response.
type SyncChannelEntry struct {
	ChannelID string  `json:"channelId"`
	Score     float64 `json:"score,omitempty"`
	Action    string  `json:"action"`
}

// SyncFullResponse is the API response for a full cache download.
type SyncFullResponse struct {
	Videos      []VideoResponse  `json:"videos"`
	Channels    []ChannelResponse `json:"channels"`
	GeneratedAt string           `json:"generatedAt"`
}
