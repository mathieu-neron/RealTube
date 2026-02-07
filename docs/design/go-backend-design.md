# SUB-DOC 3: Go Backend Design

## 6. Go Backend (Fiber)

### Project Structure

```
realtube-go/
├── cmd/
│   └── server/
│       └── main.go              # Entry point
├── internal/
│   ├── config/
│   │   └── config.go            # Configuration loading (env/file)
│   ├── handler/
│   │   ├── video.go             # Video lookup handlers
│   │   ├── vote.go              # Vote submission handlers
│   │   ├── channel.go           # Channel lookup handlers
│   │   ├── sync.go              # Delta/full sync handlers
│   │   ├── user.go              # User info handlers
│   │   └── stats.go             # Statistics handlers
│   ├── middleware/
│   │   ├── ratelimit.go         # Per-IP and per-user rate limiting
│   │   ├── cors.go              # CORS configuration
│   │   └── logging.go           # Request logging
│   ├── model/
│   │   ├── video.go             # Video data structures
│   │   ├── vote.go              # Vote data structures
│   │   ├── channel.go           # Channel data structures
│   │   └── user.go              # User/trust data structures
│   ├── repository/
│   │   ├── video_repo.go        # Video DB queries
│   │   ├── vote_repo.go         # Vote DB queries
│   │   ├── channel_repo.go      # Channel DB queries
│   │   └── user_repo.go         # User DB queries
│   ├── service/
│   │   ├── video_svc.go         # Video business logic
│   │   ├── vote_svc.go          # Vote processing + trust weighting
│   │   ├── channel_svc.go       # Channel aggregation logic
│   │   ├── trust_svc.go         # Trust score computation
│   │   └── cache_svc.go         # Redis cache management
│   └── router/
│       └── router.go            # Route definitions
├── pkg/
│   └── hash/
│       └── hash.go              # SHA256 hashing utilities
├── migrations/
│   └── *.sql                    # Database migrations
├── Dockerfile
├── go.mod
└── go.sum
```

### Key Dependencies

```
github.com/gofiber/fiber/v2       -- Web framework
github.com/jackc/pgx/v5           -- PostgreSQL driver (high performance)
github.com/redis/go-redis/v9      -- Redis client
github.com/golang-migrate/migrate -- Database migrations
github.com/rs/zerolog              -- Structured logging
```

### Middleware Stack

```go
app.Use(middleware.RequestLogger())    // Log all requests
app.Use(middleware.CORS())             // Allow extension origins
app.Use(middleware.RateLimiter())      // Per-IP rate limiting
app.Use(middleware.Recover())          // Panic recovery
```
