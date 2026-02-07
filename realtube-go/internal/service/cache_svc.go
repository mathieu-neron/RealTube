package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// Redis key TTLs matching infrastructure-design.md §12.
const (
	VideoCacheTTL   = 5 * time.Minute
	ChannelCacheTTL = 15 * time.Minute
)

// CacheService provides a Redis cache-aside layer for video and channel lookups.
type CacheService struct {
	rdb *redis.Client
}

// NewCacheService creates a new CacheService. If redisURL is empty or connection
// fails, it returns a CacheService with a nil client (cache operations become no-ops).
func NewCacheService(redisURL string) *CacheService {
	if redisURL == "" {
		log.Println("redis: no URL configured, caching disabled")
		return &CacheService{}
	}

	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Printf("redis: invalid URL %q, caching disabled: %v", redisURL, err)
		return &CacheService{}
	}

	rdb := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Printf("redis: connection failed, caching disabled: %v", err)
		return &CacheService{}
	}

	log.Println("redis: connected, caching enabled")
	return &CacheService{rdb: rdb}
}

// Client returns the underlying Redis client (for health checks). May be nil.
func (c *CacheService) Client() *redis.Client {
	return c.rdb
}

// GetVideo retrieves a cached video response. Returns nil if not cached or cache is disabled.
func (c *CacheService) GetVideo(ctx context.Context, videoID string) ([]byte, error) {
	if c.rdb == nil {
		return nil, nil
	}
	key := videoKey(videoID)
	data, err := c.rdb.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	return data, err
}

// SetVideo stores a video response in cache.
func (c *CacheService) SetVideo(ctx context.Context, videoID string, data interface{}) error {
	if c.rdb == nil {
		return nil
	}
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return c.rdb.Set(ctx, videoKey(videoID), b, VideoCacheTTL).Err()
}

// InvalidateVideo removes a video from cache (called after vote changes).
func (c *CacheService) InvalidateVideo(ctx context.Context, videoID string) error {
	if c.rdb == nil {
		return nil
	}
	return c.rdb.Del(ctx, videoKey(videoID)).Err()
}

// GetChannel retrieves a cached channel response. Returns nil if not cached.
func (c *CacheService) GetChannel(ctx context.Context, channelID string) ([]byte, error) {
	if c.rdb == nil {
		return nil, nil
	}
	key := channelKey(channelID)
	data, err := c.rdb.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	return data, err
}

// SetChannel stores a channel response in cache.
func (c *CacheService) SetChannel(ctx context.Context, channelID string, data interface{}) error {
	if c.rdb == nil {
		return nil
	}
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return c.rdb.Set(ctx, channelKey(channelID), b, ChannelCacheTTL).Err()
}

// InvalidateChannel removes a channel from cache.
func (c *CacheService) InvalidateChannel(ctx context.Context, channelID string) error {
	if c.rdb == nil {
		return nil
	}
	return c.rdb.Del(ctx, channelKey(channelID)).Err()
}

// Close shuts down the Redis connection.
func (c *CacheService) Close() error {
	if c.rdb == nil {
		return nil
	}
	return c.rdb.Close()
}

func videoKey(videoID string) string {
	return fmt.Sprintf("video:%s", videoID)
}

func channelKey(channelID string) string {
	return fmt.Sprintf("channel:%s", channelID)
}
