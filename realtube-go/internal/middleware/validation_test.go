package middleware

import "testing"

func TestValidateVideoID(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantID  string
		wantErr bool
	}{
		{"valid short", "dQw4w9WgXcQ", "dQw4w9WgXcQ", false},
		{"valid with dash", "abc-def_123", "abc-def_123", false},
		{"trims whitespace", "  abc  ", "abc", false},
		{"empty", "", "", true},
		{"too long", "12345678901234567", "", true},
		{"exactly 16", "1234567890123456", "1234567890123456", false},
		{"invalid chars", "abc def", "", true},
		{"sql injection", "a'; DROP--", "", true},
		{"unicode", "abc\u00e9def", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, errMsg := ValidateVideoID(tt.input)
			if tt.wantErr && errMsg == "" {
				t.Errorf("expected error, got none")
			}
			if !tt.wantErr && errMsg != "" {
				t.Errorf("unexpected error: %s", errMsg)
			}
			if got != tt.wantID {
				t.Errorf("got %q, want %q", got, tt.wantID)
			}
		})
	}
}

func TestValidateHashPrefix(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{"valid 4 chars", "abcd", "abcd", false},
		{"valid 8 chars", "abcd1234", "abcd1234", false},
		{"uppercase normalized", "ABCD", "abcd", false},
		{"too short", "abc", "", true},
		{"too long", "abcdefghi", "", true},
		{"non-hex", "ghij", "", true},
		{"trims whitespace", " abcd ", "abcd", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, errMsg := ValidateHashPrefix(tt.input)
			if tt.wantErr && errMsg == "" {
				t.Errorf("expected error, got none")
			}
			if !tt.wantErr && errMsg != "" {
				t.Errorf("unexpected error: %s", errMsg)
			}
			if got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestValidateChannelID(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{"valid", "UCuAXFkgsw1L7xaCfnd5JJOw", "UCuAXFkgsw1L7xaCfnd5JJOw", false},
		{"empty", "", "", true},
		{"too long 33", "123456789012345678901234567890123", "", true},
		{"exactly 32", "12345678901234567890123456789012", "12345678901234567890123456789012", false},
		{"invalid chars", "UC test!", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, errMsg := ValidateChannelID(tt.input)
			if tt.wantErr && errMsg == "" {
				t.Errorf("expected error, got none")
			}
			if !tt.wantErr && errMsg != "" {
				t.Errorf("unexpected error: %s", errMsg)
			}
			if got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestValidateUserID(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{"valid sha256", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2", false},
		{"uppercase normalized", "ABCD1234", "abcd1234", false},
		{"empty", "", "", true},
		{"too long 65", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2a", "", true},
		{"non-hex chars", "xyz123", "", true},
		{"sql injection", "abc'; DROP--", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, errMsg := ValidateUserID(tt.input)
			if tt.wantErr && errMsg == "" {
				t.Errorf("expected error, got none")
			}
			if !tt.wantErr && errMsg != "" {
				t.Errorf("unexpected error: %s", errMsg)
			}
			if got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestValidateUserAgent(t *testing.T) {
	if got := ValidateUserAgent("  RealTube/1.0  "); got != "RealTube/1.0" {
		t.Errorf("trim failed: got %q", got)
	}
	long := ""
	for i := 0; i < 200; i++ {
		long += "x"
	}
	if got := ValidateUserAgent(long); len(got) != MaxUserAgentLen {
		t.Errorf("truncation failed: got len %d, want %d", len(got), MaxUserAgentLen)
	}
}
