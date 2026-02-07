package config

import "os"

type Config struct {
	Port        string
	DatabaseURL string
	RedisURL    string
	LogLevel    string
	Environment string
	CORSOrigins string
}

func Load() *Config {
	return &Config{
		Port:        getEnv("PORT", "8080"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://realtube:password@localhost:5432/realtube"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379"),
		LogLevel:    getEnv("LOG_LEVEL", "info"),
		Environment: getEnv("ENVIRONMENT", "development"),
		CORSOrigins: getEnv("CORS_ORIGINS", "*"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
