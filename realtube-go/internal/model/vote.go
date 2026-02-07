package model

import "time"

// Vote represents an individual vote record.
type Vote struct {
	ID          int64     `json:"id"`
	VideoID     string    `json:"videoId"`
	UserID      string    `json:"userId"`
	Category    string    `json:"category"`
	TrustWeight float64   `json:"trustWeight"`
	CreatedAt   time.Time `json:"createdAt"`
	IPHash      string    `json:"-"`
	UserAgent   string    `json:"-"`
}

// VoteRequest is the API request body for submitting a vote.
type VoteRequest struct {
	VideoID   string `json:"videoId"`
	Category  string `json:"category"`
	UserID    string `json:"userId"`
	UserAgent string `json:"userAgent,omitempty"`
}

// VoteDeleteRequest is the API request body for removing a vote.
type VoteDeleteRequest struct {
	VideoID string `json:"videoId"`
	UserID  string `json:"userId"`
}

// VoteResponse is the API response after submitting a vote.
type VoteResponse struct {
	Success   bool    `json:"success"`
	NewScore  float64 `json:"newScore"`
	UserTrust float64 `json:"userTrust"`
}
