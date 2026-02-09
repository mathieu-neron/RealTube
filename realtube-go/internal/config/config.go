package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Port        string
	DatabaseURL string
	RedisURL    string
	LogLevel    string
	Environment string
	CORSOrigins string
	ExportDir   string
}

func Load() *Config {
	return &Config{
		Port:        getEnv("PORT", "8080"),
		DatabaseURL: buildDatabaseURL(),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379"),
		LogLevel:    getEnv("LOG_LEVEL", "info"),
		Environment: getEnv("ENVIRONMENT", "development"),
		CORSOrigins: getEnv("CORS_ORIGINS", "*"),
		ExportDir:   getEnv("EXPORT_DIR", "/exports"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// readSecret reads a Docker secret from /run/secrets/<name>.
// Falls back to the given env var, then to the fallback value.
func readSecret(secretName, envVar, fallback string) string {
	data, err := os.ReadFile("/run/secrets/" + secretName)
	if err == nil {
		return strings.TrimSpace(string(data))
	}
	return getEnv(envVar, fallback)
}

// buildDatabaseURL constructs the database connection string.
// Priority: DATABASE_URL env var > constructed from components + secret file.
func buildDatabaseURL() string {
	if url := os.Getenv("DATABASE_URL"); url != "" {
		return url
	}

	user := getEnv("POSTGRES_USER", "realtube")
	password := readSecret("postgres_password", "POSTGRES_PASSWORD", "password")
	host := getEnv("POSTGRES_HOST", "localhost")
	port := getEnv("POSTGRES_PORT", "5432")
	db := getEnv("POSTGRES_DB", "realtube")

	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s", user, password, host, port, db)
}
