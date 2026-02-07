package db

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	maxRetries    = 5
	retryInterval = 2 * time.Second
)

func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}

	config.MaxConns = 10
	config.MinConns = 2
	config.MaxConnLifetime = time.Hour
	config.MaxConnIdleTime = 30 * time.Minute
	config.HealthCheckPeriod = time.Minute

	var pool *pgxpool.Pool
	for attempt := 1; attempt <= maxRetries; attempt++ {
		pool, err = pgxpool.NewWithConfig(ctx, config)
		if err == nil {
			if pingErr := pool.Ping(ctx); pingErr == nil {
				log.Println("database connected")
				return pool, nil
			} else {
				pool.Close()
				err = pingErr
			}
		}

		log.Printf("database connection attempt %d/%d failed: %v", attempt, maxRetries, err)
		if attempt < maxRetries {
			time.Sleep(retryInterval)
		}
	}

	return nil, fmt.Errorf("database connection failed after %d attempts: %w", maxRetries, err)
}
