package service

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ChannelWorker is a periodic background job that recalculates channel scores
// and sets auto_flag_new when thresholds are met (trust-system-design.md §10).
type ChannelWorker struct {
	pool     *pgxpool.Pool
	interval time.Duration
	stopCh   chan struct{}
}

// NewChannelWorker creates a worker that ticks every interval.
func NewChannelWorker(pool *pgxpool.Pool, interval time.Duration) *ChannelWorker {
	return &ChannelWorker{
		pool:     pool,
		interval: interval,
		stopCh:   make(chan struct{}),
	}
}

// Start begins the periodic channel score recalculation loop.
// It runs one tick immediately, then every interval.
func (w *ChannelWorker) Start(ctx context.Context) {
	log.Printf("channel-worker: starting (interval=%s)", w.interval)

	// Run once immediately on startup
	w.tick(ctx)

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			w.tick(ctx)
		case <-ctx.Done():
			log.Println("channel-worker: stopping (context cancelled)")
			return
		case <-w.stopCh:
			log.Println("channel-worker: stopping (stop signal)")
			return
		}
	}
}

// Stop signals the worker to stop.
func (w *ChannelWorker) Stop() {
	close(w.stopCh)
}

// tick runs one cycle: recalculate all channel scores and update auto_flag_new.
func (w *ChannelWorker) tick(ctx context.Context) {
	start := time.Now()

	updated, autoFlagged, preliminary, err := w.recalculateAll(ctx)
	if err != nil {
		log.Printf("channel-worker: error: %v", err)
		return
	}

	elapsed := time.Since(start)
	log.Printf("channel-worker: tick complete — %d channels updated, %d auto-flagged, %d preliminary scores set (%s)",
		updated, autoFlagged, preliminary, elapsed.Round(time.Millisecond))
}

// recalculateAll recalculates scores for all channels with tracked videos.
func (w *ChannelWorker) recalculateAll(ctx context.Context) (updated, autoFlagged, preliminary int, err error) {
	// Get all distinct channel IDs that have at least one video with votes
	rows, err := w.pool.Query(ctx, `
		SELECT DISTINCT channel_id
		FROM videos
		WHERE channel_id IS NOT NULL AND total_votes > 0`)
	if err != nil {
		return 0, 0, 0, err
	}
	defer rows.Close()

	var channelIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return 0, 0, 0, err
		}
		channelIDs = append(channelIDs, id)
	}
	if err := rows.Err(); err != nil {
		return 0, 0, 0, err
	}

	for _, chID := range channelIDs {
		wasAutoFlagged, prelimCount, err := w.recalculateChannel(ctx, chID)
		if err != nil {
			log.Printf("channel-worker: error recalculating %s: %v", chID, err)
			continue
		}
		updated++
		if wasAutoFlagged {
			autoFlagged++
		}
		preliminary += prelimCount
	}

	return updated, autoFlagged, preliminary, nil
}

// recalculateChannel recalculates a single channel's score and auto-flag status.
func (w *ChannelWorker) recalculateChannel(ctx context.Context, channelID string) (autoFlagged bool, preliminaryCount int, err error) {
	// Compute channel stats from its videos
	var flagged, tracked int
	var avgFlaggedScore float64
	err = w.pool.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE score >= 50)          AS flagged_videos,
			COUNT(*) FILTER (WHERE total_votes > 0)      AS total_tracked_videos,
			COALESCE(AVG(score) FILTER (WHERE score >= 50), 0) AS avg_flagged_score
		FROM videos
		WHERE channel_id = $1`, channelID).Scan(&flagged, &tracked, &avgFlaggedScore)
	if err != nil {
		return false, 0, err
	}

	// Ensure channel exists
	_, err = w.pool.Exec(ctx, `
		INSERT INTO channels (channel_id) VALUES ($1)
		ON CONFLICT (channel_id) DO NOTHING`, channelID)
	if err != nil {
		return false, 0, err
	}

	// Compute channel score
	var channelScore float64
	if tracked >= 3 {
		channelScore = (float64(flagged) / float64(tracked)) * avgFlaggedScore
		// Round to 2 decimal places
		channelScore = float64(int(channelScore*100+0.5)) / 100
	}

	// Determine auto_flag_new status (§10):
	//   channel_score >= 80 AND flagged_videos >= 20 AND NOT locked
	var locked bool
	err = w.pool.QueryRow(ctx, `SELECT locked FROM channels WHERE channel_id = $1`, channelID).Scan(&locked)
	if err != nil {
		return false, 0, err
	}

	shouldAutoFlag := channelScore >= 80 && flagged >= 20 && !locked

	// Update channel record
	_, err = w.pool.Exec(ctx, `
		UPDATE channels
		SET score = $1, flagged_videos = $2, total_videos = $3,
		    auto_flag_new = $4, last_updated = NOW()
		WHERE channel_id = $5`,
		channelScore, flagged, tracked, shouldAutoFlag, channelID)
	if err != nil {
		return false, 0, err
	}

	// Apply preliminary score to new videos from auto-flagged channels
	if shouldAutoFlag {
		tag, err := w.pool.Exec(ctx, `
			UPDATE videos
			SET score = 60, last_updated = NOW()
			WHERE channel_id = $1 AND total_votes = 0 AND score = 0`,
			channelID)
		if err != nil {
			return true, 0, err
		}
		preliminaryCount = int(tag.RowsAffected())
	}

	return shouldAutoFlag, preliminaryCount, nil
}
