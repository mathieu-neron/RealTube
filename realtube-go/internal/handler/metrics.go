package handler

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/valyala/fasthttp/fasthttpadaptor"
)

// Metrics holds all Prometheus collectors for the RealTube Go backend.
var Metrics = struct {
	VotesTotal           *prometheus.CounterVec
	RequestDuration      *prometheus.HistogramVec
	DBPoolActive         prometheus.GaugeFunc
	DBPoolIdle           prometheus.GaugeFunc
	RequestsInFlight     prometheus.Gauge
	CacheHits            prometheus.Counter
	CacheMisses          prometheus.Counter
	ScoreRecalcDuration  prometheus.Histogram
}{}

// InitMetrics registers all Prometheus metrics. Call once at startup.
func InitMetrics(pool *pgxpool.Pool) {
	Metrics.VotesTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "realtube_votes_total",
			Help: "Total votes submitted, by category.",
		},
		[]string{"category"},
	)

	Metrics.RequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "realtube_api_request_duration_seconds",
			Help:    "HTTP request duration in seconds, by endpoint and method.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"endpoint", "method", "status"},
	)

	Metrics.RequestsInFlight = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "realtube_requests_in_flight",
			Help: "Number of HTTP requests currently being served.",
		},
	)

	Metrics.CacheHits = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "realtube_cache_hits_total",
			Help: "Total Redis cache hits.",
		},
	)

	Metrics.CacheMisses = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "realtube_cache_misses_total",
			Help: "Total Redis cache misses.",
		},
	)

	Metrics.ScoreRecalcDuration = prometheus.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "realtube_score_recalculation_duration_seconds",
			Help:    "Duration of video score recalculations.",
			Buckets: prometheus.DefBuckets,
		},
	)

	// DB pool gauges — read live stats from pgxpool
	if pool != nil {
		Metrics.DBPoolActive = prometheus.NewGaugeFunc(
			prometheus.GaugeOpts{
				Name: "realtube_db_connection_pool_active",
				Help: "Number of active database connections.",
			},
			func() float64 {
				return float64(pool.Stat().AcquiredConns())
			},
		)

		Metrics.DBPoolIdle = prometheus.NewGaugeFunc(
			prometheus.GaugeOpts{
				Name: "realtube_db_connection_pool_idle",
				Help: "Number of idle database connections.",
			},
			func() float64 {
				return float64(pool.Stat().IdleConns())
			},
		)

		prometheus.MustRegister(Metrics.DBPoolActive)
		prometheus.MustRegister(Metrics.DBPoolIdle)
	}

	prometheus.MustRegister(
		Metrics.VotesTotal,
		Metrics.RequestDuration,
		Metrics.RequestsInFlight,
		Metrics.CacheHits,
		Metrics.CacheMisses,
		Metrics.ScoreRecalcDuration,
	)
}

// MetricsMiddleware records request duration and in-flight count for Prometheus.
func MetricsMiddleware() fiber.Handler {
	return func(c fiber.Ctx) error {
		// Don't instrument the /metrics endpoint itself
		if c.Path() == "/metrics" {
			return c.Next()
		}

		// Copy path and method into owned strings BEFORE c.Next() — Fiber
		// returns slices backed by the fasthttp buffer which can be reused
		// or overwritten by handlers (especially fasthttpadaptor).
		path := string([]byte(c.Path()))
		method := string([]byte(c.Method()))
		endpoint := sanitizeEndpoint(path)

		Metrics.RequestsInFlight.Inc()
		start := time.Now()

		err := c.Next()

		duration := time.Since(start).Seconds()
		status := strconv.Itoa(c.Response().StatusCode())

		Metrics.RequestDuration.WithLabelValues(endpoint, method, status).Observe(duration)
		Metrics.RequestsInFlight.Dec()

		return err
	}
}

// sanitizeEndpoint normalizes paths to avoid cardinality explosion.
func sanitizeEndpoint(path string) string {
	switch {
	case len(path) > 12 && path[:12] == "/api/videos/":
		return "/api/videos/:hashPrefix"
	case len(path) > 14 && path[:14] == "/api/channels/":
		return "/api/channels/:channelId"
	case len(path) > 11 && path[:11] == "/api/users/":
		return "/api/users/:userId"
	default:
		return path
	}
}

// MetricsHandler serves the Prometheus /metrics endpoint via Fiber.
func MetricsHandler() fiber.Handler {
	httpHandler := fasthttpadaptor.NewFastHTTPHandler(promhttp.Handler())
	return func(c fiber.Ctx) error {
		httpHandler(c.RequestCtx())
		return nil
	}
}
