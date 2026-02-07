package model

import "time"

// Video represents a flagged video in the database.
type Video struct {
	VideoID       string    `json:"videoId"`
	ChannelID     *string   `json:"channelId,omitempty"`
	Title         *string   `json:"title,omitempty"`
	Score         float64   `json:"score"`
	TotalVotes    int       `json:"totalVotes"`
	Locked        bool      `json:"locked"`
	Hidden        bool      `json:"-"`
	ShadowHidden  bool      `json:"-"`
	VideoDuration *float64  `json:"videoDuration,omitempty"`
	IsShort       bool      `json:"isShort,omitempty"`
	FirstReported time.Time `json:"firstReported"`
	LastUpdated   time.Time `json:"lastUpdated"`
	Service       string    `json:"service,omitempty"`
}

// VideoCategory represents per-category vote aggregates for a video.
type VideoCategory struct {
	VideoID       string  `json:"videoId"`
	Category      string  `json:"category"`
	VoteCount     int     `json:"votes"`
	WeightedScore float64 `json:"weightedScore"`
}

// VideoResponse is the API response for video lookups.
type VideoResponse struct {
	VideoID      string                       `json:"videoId"`
	Score        float64                      `json:"score"`
	Categories   map[string]*CategoryDetail   `json:"categories"`
	TotalVotes   int                          `json:"totalVotes"`
	Locked       bool                         `json:"locked"`
	ChannelID    *string                      `json:"channelId,omitempty"`
	ChannelScore float64                      `json:"channelScore,omitempty"`
	LastUpdated  time.Time                    `json:"lastUpdated"`
}

// CategoryDetail holds the vote count and weighted score for a single category.
type CategoryDetail struct {
	Votes         int     `json:"votes"`
	WeightedScore float64 `json:"weightedScore"`
}
