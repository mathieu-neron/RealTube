# SUB-DOC 7: Infrastructure Design

## 12. Caching Strategy

### Client-Side (Extension)

**IndexedDB** stores the local cache:
```mermaid
erDiagram
    flagged_videos {
        string videoId PK
        float score
        JSON categories
        string channelId
        timestamp lastUpdated
    }

    flagged_channels {
        string channelId PK
        float score
        boolean autoFlag
        timestamp lastUpdated
    }

    pending_votes {
        string videoId
        string category
        timestamp timestamp
    }
```

**Sync Schedule:**
- **Delta sync**: Every 30 minutes, `GET /api/sync/delta?since=LAST_SYNC`
- **Full refresh**: Every 24 hours, `GET /api/sync/full`
- **On-demand**: User clicks refresh in popup
- **Batch lookup**: For cache misses on visible videos (hash-prefix API)

### Server-Side (Redis)

| Key Pattern | Value | TTL |
|-------------|-------|-----|
| `video:{videoId}` | `JSON { score, categories, channelId, locked }` | 5 min |
| `channel:{channelId}` | `JSON { score, flaggedCount, autoFlag }` | 15 min |
| `ratelimit:{ip}:{endpoint}` | counter | 1 min |
| `sync:delta:{timestamp}` | sorted set of changed video IDs | 48 hours |

**TTLs:**
- Video data: 5 minutes (frequently updated)
- Channel data: 15 minutes (less volatile)
- Rate limit counters: 1 minute
- Delta sync sets: 48 hours

### NGINX Proxy Cache

| Endpoint | Cache TTL | Notes |
|----------|-----------|-------|
| `/api/videos/:hashPrefix` | 5 seconds | Privacy-preserving, high traffic |
| `/api/channels/:channelId` | 60 seconds | |
| `/api/stats` | 5 minutes | |
| `/api/sync/full` | 1 hour | |
| `/api/sync/delta` | no cache | Must be fresh |
| `/api/votes` | no cache | Write endpoint |

---

## 14. Concurrency & Data Consistency

### Challenge Overview

RealTube has multiple concurrent writers (Go + Python backends), many simultaneous users voting on the same videos, background aggregation jobs, and distributed client caches. This section defines the consistency model.

### Strategy Per Component

| Component | Concurrency Pattern | Details |
|-----------|---------------------|---------|
| Vote insertion | **Atomic SQL + constraints** | `total_votes = total_votes + 1`; `UNIQUE(video_id, user_id)` with `ON CONFLICT DO UPDATE` |
| Video score recalculation | **Eventual consistency (~5-10s)** | Deferred via PostgreSQL `NOTIFY/LISTEN`; background worker batches recalculations |
| Channel aggregation | **Eventual consistency (~15min)** | Periodic background job; accepts brief staleness |
| Redis cache | **Write-through invalidation** | On vote insert: write to PG, then `DELETE` Redis key; next read re-populates |
| Delta sync | **Consistent snapshot** | Reads from `sync_cache` table populated only after score recalculation completes |
| Trust scores | **Point-in-time snapshot** | Captured immutably at vote time; recalculated async for future votes |
| Offline votes | **Last-write-wins** | Timestamp-based conflict resolution; latest vote wins |
| Dual backends | **Database as single source of truth** | Both Go and Python are stateless; PG serializes all writes via MVCC |

### Atomic Vote Insertion

Both backends use atomic SQL -- no application-level read-modify-write:

```sql
-- Insert vote (idempotent with conflict handling)
INSERT INTO votes (video_id, user_id, category, trust_weight, ip_hash, user_agent)
SELECT $1, $2, $3, trust_score, $5, $6 FROM users WHERE user_id = $2
ON CONFLICT (video_id, user_id) DO UPDATE
SET category = EXCLUDED.category, trust_weight = EXCLUDED.trust_weight, created_at = NOW();

-- Atomic counter increment
UPDATE videos SET total_votes = total_votes + 1, last_updated = NOW()
WHERE video_id = $1;

-- Atomic per-category counter
INSERT INTO video_categories (video_id, category, vote_count)
VALUES ($1, $3, 1)
ON CONFLICT (video_id, category) DO UPDATE
SET vote_count = video_categories.vote_count + 1;
```

### Async Score Recalculation

Score recalculation is triggered but not blocked on:

```sql
-- PostgreSQL trigger: notify background worker
CREATE OR REPLACE FUNCTION notify_vote_change() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('vote_changes', NEW.video_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vote_inserted AFTER INSERT OR UPDATE ON votes
FOR EACH ROW EXECUTE FUNCTION notify_vote_change();
```

A background worker (in both Go and Python) listens for notifications and batches recalculations. If 50 votes hit video X in 5 seconds, it recalculates once.

### Cache Invalidation

```mermaid
sequenceDiagram
    participant Client
    participant Backend
    participant PG as PostgreSQL
    participant Redis

    Client->>Backend: POST /api/votes
    Backend->>PG: INSERT vote (source of truth)
    Backend->>Redis: DELETE video:{videoId}
    Note over Redis: Cache invalidated

    Client->>Backend: GET /api/videos/:hash
    Backend->>Redis: GET video:{videoId}
    Redis-->>Backend: MISS
    Backend->>PG: SELECT video
    PG-->>Backend: video data
    Backend->>Redis: SET video:{videoId}
    Backend-->>Client: video data

    opt Multi-instance
        Backend->>Redis: PUBLISH cache:invalidate {videoId}
        Redis-->>Backend: All instances evict local references
    end
```

### Consistency Model Summary

- **Writes**: Strongly consistent (PostgreSQL ACID)
- **Scores**: Eventually consistent (5-10 second lag)
- **Channel scores**: Eventually consistent (up to 15 minutes)
- **Client cache**: Eventually consistent (30-minute delta sync)
- **Redis**: Eventually consistent (5-second max staleness)

This model trades absolute real-time accuracy for throughput and simplicity. For a crowdsourced voting system, a few seconds of score staleness is imperceptible to users.

---

## 15. Infrastructure (Docker Compose)

```yaml
# docker-compose.yml

services:
  # ---- NGINX Reverse Proxy ----
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/certs:/etc/nginx/certs:ro
    depends_on:
      - go-backend
      - python-backend
    restart: unless-stopped

  # ---- Go Backend (Primary) ----
  go-backend:
    build:
      context: ./realtube-go
      dockerfile: Dockerfile
    environment:
      - DATABASE_URL=postgres://realtube:password@postgres:5432/realtube
      - REDIS_URL=redis://redis:6379
      - PORT=8080
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped

  # ---- Python Backend (Secondary) ----
  python-backend:
    build:
      context: ./realtube-python
      dockerfile: Dockerfile
    environment:
      - DATABASE_URL=postgres://realtube:password@postgres:5432/realtube
      - REDIS_URL=redis://redis:6379
      - PORT=8081
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped

  # ---- PostgreSQL ----
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: realtube
      POSTGRES_PASSWORD: password
      POSTGRES_DB: realtube
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U realtube"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # ---- Redis ----
  redis:
    image: redis:7-alpine
    command: >
      redis-server
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
      --appendonly no
    volumes:
      - redis_data:/data
    restart: unless-stopped

  # ---- Database Export (cron job) ----
  db-exporter:
    image: postgres:16-alpine
    environment:
      PGHOST: postgres
      PGUSER: realtube
      PGPASSWORD: password
      PGDATABASE: realtube
    volumes:
      - ./exports:/exports
    entrypoint: >
      sh -c "while true; do
        pg_dump -Fc realtube > /exports/realtube-$$(date +%Y%m%d).dump;
        sleep 86400;
      done"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### NGINX Configuration (key parts)

```nginx
upstream go_backend {
    server go-backend:8080;
}

upstream python_backend {
    server python-backend:8081;
}

# Default: route to Go backend
server {
    listen 80;

    # Rate limiting zones
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
    limit_req_zone $binary_remote_addr zone=votes:10m rate=10r/m;

    # API routes -> Go backend (primary)
    location /api/ {
        limit_req zone=api burst=20;
        proxy_pass http://go_backend;
        proxy_cache api_cache;
        proxy_cache_valid 200 5s;
    }

    # Vote endpoints -> stricter rate limiting
    location /api/votes {
        limit_req zone=votes burst=5;
        proxy_pass http://go_backend;
    }

    # Python backend (available on /py/ prefix for testing/comparison)
    location /py/api/ {
        rewrite ^/py(.*)$ $1 break;
        proxy_pass http://python_backend;
    }
}
```

---

## 21. Containerization Details

### Go Dockerfile (multi-stage, ~15MB final image)

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /realtube ./cmd/server

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /realtube /realtube
EXPOSE 8080
ENTRYPOINT ["/realtube"]
```

### Python Dockerfile (multi-stage, ~150MB final image)

```dockerfile
FROM python:3.12-slim AS deps
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --target=/deps -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=deps /deps /usr/local/lib/python3.12/site-packages
COPY app/ ./app/
EXPOSE 8081
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8081"]
```

### Environment Variables (shared across both backends)

```
DATABASE_URL=postgres://user:pass@host:5432/dbname
REDIS_URL=redis://host:6379
PORT=8080
LOG_LEVEL=info
ENVIRONMENT=production|development
CORS_ORIGINS=chrome-extension://xxx,moz-extension://xxx
```

---

## 22. Logging & Monitoring

### Structured Log Format

```json
{
  "timestamp": "2026-02-06T12:00:00.123Z",
  "level": "info",
  "service": "realtube-go",
  "method": "POST",
  "path": "/api/votes",
  "status": 200,
  "duration_ms": 12,
  "ip_hash": "abc123...",
  "user_id_prefix": "def456...",
  "video_id": "dQw4w9WgXcQ"
}
```

### Log Levels

| Level | Usage |
|-------|-------|
| `error` | Failed DB queries, unhandled exceptions, constraint violations |
| `warn` | Rate limit hits, suspicious vote patterns, cache miss spikes |
| `info` | Vote submissions, score recalculations, sync requests |
| `debug` | Individual cache lookups, DB query timings (dev only) |

### Libraries

- **Go**: `zerolog` (structured, zero-allocation)
- **Python**: `structlog` (structured, async-compatible)

### Prometheus Metrics

```
realtube_votes_total{category}                     # Counter
realtube_api_request_duration_seconds{endpoint}     # Histogram
realtube_active_users_gauge                         # Gauge
realtube_cache_hit_ratio                            # Gauge
realtube_score_recalculation_duration_seconds       # Histogram
realtube_db_connection_pool_active                  # Gauge
```

### Optional Monitoring Stack (Docker Compose add-on)

- Prometheus scrapes `/metrics` from both backends
- Grafana dashboards for API performance, vote rates, cache efficiency

---

## 23. Health Checks & Graceful Shutdown

### Health Endpoints

**`GET /health/live`** (liveness -- is the process running?)
```json
{ "status": "ok" }
```
Used by Docker HEALTHCHECK to restart crashed containers.

**`GET /health/ready`** (readiness -- can it serve traffic?)
```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "up", "latency_ms": 2 },
    "redis": { "status": "up", "latency_ms": 1 },
    "score_worker": { "status": "running", "last_run": "2026-02-06T12:00:00Z" }
  },
  "uptime_seconds": 86400,
  "version": "1.0.0"
}
```
Used by NGINX to route traffic away from unhealthy instances.

### Docker Compose Health Checks

```yaml
go-backend:
  healthcheck:
    test: ["CMD", "wget", "--spider", "-q", "http://localhost:8080/health/live"]
    interval: 10s
    timeout: 3s
    retries: 3

python-backend:
  healthcheck:
    test: ["CMD", "python", "-c", "import httpx; httpx.get('http://localhost:8081/health/live').raise_for_status()"]
    interval: 10s
    timeout: 3s
    retries: 3
```

### Graceful Shutdown Sequence

```mermaid
flowchart TD
    A["SIGTERM received"] --> B["Stop accepting new connections<br/>(close listener)"]
    B --> C["Wait for in-flight requests<br/>(30s timeout)"]
    C --> D["Flush pending score recalculations"]
    D --> E["Close database connection pool"]
    E --> F["Close Redis connection"]
    F --> G["Exit 0"]
```

- **Go**: `signal.NotifyContext` + `server.Shutdown(ctx)`
- **Python**: `uvicorn` SIGTERM handling + `@app.on_event("shutdown")` for cleanup
