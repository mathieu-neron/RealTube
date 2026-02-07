package hash

import (
	"crypto/sha256"
	"encoding/hex"
)

// SHA256Hex returns the hex-encoded SHA256 hash of the input string.
func SHA256Hex(input string) string {
	h := sha256.Sum256([]byte(input))
	return hex.EncodeToString(h[:])
}

// VideoHashPrefix returns the first prefixLen characters of SHA256(videoId).
// Used for privacy-preserving video lookups (k-anonymity).
func VideoHashPrefix(videoID string, prefixLen int) string {
	full := SHA256Hex(videoID)
	if prefixLen > len(full) {
		return full
	}
	return full[:prefixLen]
}

// IteratedSHA256 applies SHA256 iteratively n times to produce a derived hash.
// Used for user ID hashing (5000 iterations) and IP hashing.
func IteratedSHA256(input string, iterations int) string {
	data := []byte(input)
	for range iterations {
		h := sha256.Sum256(data)
		data = h[:]
	}
	return hex.EncodeToString(data)
}

// HashUserID hashes a local UUID with 5000 iterations of SHA256
// to produce the public user ID sent to the server.
func HashUserID(localUUID string) string {
	return IteratedSHA256(localUUID, 5000)
}

// HashIP hashes an IP address with a salt using 5000 iterations of SHA256.
func HashIP(ip, salt string) string {
	return IteratedSHA256(salt+ip, 5000)
}
