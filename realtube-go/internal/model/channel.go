package model

import "time"

// Channel represents a YouTube channel with aggregated AI scores.
type Channel struct {
	ChannelID    string    `json:"channelId"`
	ChannelName  string    `json:"channelName,omitempty"`
	Score        float64   `json:"score"`
	TotalVideos  int       `json:"totalVideos"`
	FlaggedVideos int      `json:"flaggedVideos"`
	TopCategory  string    `json:"topCategory,omitempty"`
	Locked       bool      `json:"locked"`
	AutoFlagNew  bool      `json:"autoFlagNew"`
	LastUpdated  time.Time `json:"lastUpdated"`
}

// ChannelResponse is the API response for channel lookups.
type ChannelResponse struct {
	ChannelID     string   `json:"channelId"`
	Score         float64  `json:"score"`
	TotalVideos   int      `json:"totalVideos"`
	FlaggedVideos int      `json:"flaggedVideos"`
	TopCategories []string `json:"topCategories"`
	Locked        bool     `json:"locked"`
	LastUpdated   string   `json:"lastUpdated"`
}
