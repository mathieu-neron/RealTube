package service

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ScoreWorker listens for PostgreSQL NOTIFY on the 'vote_changes' channel
// and batches score recalculations. If 50 votes hit video X in 5 seconds,
// it recalculates once (infrastructure-design.md §14).
type ScoreWorker struct {
	pool     *pgxpool.Pool
	scoreSvc *ScoreService
	cache    *CacheService
	batchMs  time.Duration

	mu      sync.Mutex
	pending map[string]struct{} // video IDs waiting for recalculation
}

// NewScoreWorker creates a score recalculation worker.
func NewScoreWorker(pool *pgxpool.Pool, scoreSvc *ScoreService, cache *CacheService) *ScoreWorker {
	return &ScoreWorker{
		pool:     pool,
		scoreSvc: scoreSvc,
		cache:    cache,
		batchMs:  5 * time.Second,
		pending:  make(map[string]struct{}),
	}
}

// Start begins listening for vote_changes notifications and processing batches.
func (w *ScoreWorker) Start(ctx context.Context) {
	log.Printf("score-worker: starting (batch window=%s)", w.batchMs)

	for {
		if err := w.listenLoop(ctx); err != nil {
			if ctx.Err() != nil {
				log.Println("score-worker: stopping (context cancelled)")
				return
			}
			log.Printf("score-worker: listen error, reconnecting in 5s: %v", err)
			select {
			case <-time.After(5 * time.Second):
			case <-ctx.Done():
				log.Println("score-worker: stopping (context cancelled)")
				return
			}
		}
	}
}

// listenLoop acquires a dedicated connection, LISTENs on vote_changes,
// and processes notifications in batched windows.
func (w *ScoreWorker) listenLoop(ctx context.Context) error {
	conn, err := w.pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	_, err = conn.Exec(ctx, "LISTEN vote_changes")
	if err != nil {
		return err
	}
	log.Println("score-worker: listening on vote_changes")

	// Start the batch flush goroutine
	flushCtx, flushCancel := context.WithCancel(ctx)
	defer flushCancel()
	go w.flushLoop(flushCtx)

	for {
		notification, err := conn.Conn().WaitForNotification(ctx)
		if err != nil {
			return err
		}

		videoID := notification.Payload
		if videoID == "" {
			continue
		}

		w.mu.Lock()
		w.pending[videoID] = struct{}{}
		w.mu.Unlock()
	}
}

// flushLoop periodically drains the pending set and recalculates scores.
func (w *ScoreWorker) flushLoop(ctx context.Context) {
	ticker := time.NewTicker(w.batchMs)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			w.flush(ctx)
		case <-ctx.Done():
			// Final flush before exit
			w.flush(context.Background())
			return
		}
	}
}

// flush drains the pending set and recalculates each video's score.
func (w *ScoreWorker) flush(ctx context.Context) {
	w.mu.Lock()
	if len(w.pending) == 0 {
		w.mu.Unlock()
		return
	}

	// Swap out the pending map
	batch := w.pending
	w.pending = make(map[string]struct{})
	w.mu.Unlock()

	recalculated := 0
	for videoID := range batch {
		if err := w.scoreSvc.RecalculateVideoScore(ctx, videoID); err != nil {
			log.Printf("score-worker: recalculate error for %s: %v", videoID, err)
			continue
		}

		// Invalidate Redis cache so next read gets fresh data
		if w.cache != nil {
			if err := w.cache.InvalidateVideo(ctx, videoID); err != nil {
				log.Printf("score-worker: cache invalidate error for %s: %v", videoID, err)
			}
		}

		recalculated++
	}

	if recalculated > 0 {
		log.Printf("score-worker: batch complete — %d videos recalculated (from %d notifications)",
			recalculated, len(batch))
	}
}
