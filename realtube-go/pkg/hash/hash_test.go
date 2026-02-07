package hash

import (
	"testing"
)

func TestSHA256Hex(t *testing.T) {
	// Known SHA256 of "hello"
	want := "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
	got := SHA256Hex("hello")
	if got != want {
		t.Errorf("SHA256Hex(\"hello\") = %s, want %s", got, want)
	}
}

func TestSHA256Hex_Empty(t *testing.T) {
	// SHA256 of empty string
	want := "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
	got := SHA256Hex("")
	if got != want {
		t.Errorf("SHA256Hex(\"\") = %s, want %s", got, want)
	}
}

func TestVideoHashPrefix(t *testing.T) {
	fullHash := SHA256Hex("dQw4w9WgXcQ")

	tests := []struct {
		name      string
		videoID   string
		prefixLen int
		want      string
	}{
		{"4 char prefix", "dQw4w9WgXcQ", 4, fullHash[:4]},
		{"8 char prefix", "dQw4w9WgXcQ", 8, fullHash[:8]},
		{"full hash if prefix too long", "dQw4w9WgXcQ", 100, fullHash},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := VideoHashPrefix(tt.videoID, tt.prefixLen)
			if got != tt.want {
				t.Errorf("VideoHashPrefix(%q, %d) = %s, want %s", tt.videoID, tt.prefixLen, got, tt.want)
			}
		})
	}
}

func TestIteratedSHA256(t *testing.T) {
	// 1 iteration should equal a single SHA256
	oneIter := IteratedSHA256("test", 1)
	single := SHA256Hex("test")
	if oneIter != single {
		t.Errorf("IteratedSHA256(\"test\", 1) = %s, want %s", oneIter, single)
	}

	// Multiple iterations should differ from single
	multiIter := IteratedSHA256("test", 5000)
	if multiIter == single {
		t.Error("5000 iterations should differ from single iteration")
	}

	// Same input should produce same output (deterministic)
	again := IteratedSHA256("test", 5000)
	if multiIter != again {
		t.Error("IteratedSHA256 should be deterministic")
	}
}

func TestHashUserID(t *testing.T) {
	uuid := "550e8400-e29b-41d4-a716-446655440000"
	hash := HashUserID(uuid)

	// Should be 64 hex chars (SHA256 output)
	if len(hash) != 64 {
		t.Errorf("HashUserID length = %d, want 64", len(hash))
	}

	// Should be deterministic
	if hash != HashUserID(uuid) {
		t.Error("HashUserID should be deterministic")
	}

	// Different input should produce different output
	other := HashUserID("different-uuid")
	if hash == other {
		t.Error("different UUIDs should produce different hashes")
	}
}

func TestHashIP(t *testing.T) {
	ip := "192.168.1.1"
	salt := "random-salt-value"
	hash := HashIP(ip, salt)

	// Should be 64 hex chars
	if len(hash) != 64 {
		t.Errorf("HashIP length = %d, want 64", len(hash))
	}

	// Different salt should produce different hash
	otherSalt := HashIP(ip, "different-salt")
	if hash == otherSalt {
		t.Error("different salts should produce different hashes")
	}

	// Different IP should produce different hash
	otherIP := HashIP("10.0.0.1", salt)
	if hash == otherIP {
		t.Error("different IPs should produce different hashes")
	}
}

func TestIteratedSHA256_MatchesSingleForOneIteration(t *testing.T) {
	// IteratedSHA256 with 1 iteration operates on raw bytes, not hex string,
	// so it should match SHA256Hex which also hashes the string to bytes.
	input := "some-video-id"
	got := IteratedSHA256(input, 1)
	want := SHA256Hex(input)
	if got != want {
		t.Errorf("1-iteration mismatch: got %s, want %s", got, want)
	}
}
