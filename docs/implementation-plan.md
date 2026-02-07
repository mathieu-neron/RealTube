# RealTube Implementation Plan

~40 small, independently testable steps grouped into 5 phases. Each step builds on previous steps but can be verified in isolation.

---

## Phase 1: Foundation (Database + Project Scaffolding)

### Step 1: Initialize Git Repository & Root Structure
**Description:** Create the monorepo root with `docker-compose.yml` skeleton, `.gitignore`, and placeholder directories.
**Files:**
- `docker-compose.yml` (services commented out, filled in later)
- `.gitignore`
- `migrations/` directory
- `nginx/` directory
- `exports/` directory
**Design docs:** `design-overview.md`, `infrastructure-design.md`
**Verification:** `git status` shows clean repo with expected structure; `docker compose config` parses without errors.

### Step 2: PostgreSQL Database Migration - Core Tables
**Description:** Create the first SQL migration with the `videos`, `video_categories`, and `votes` tables including all indexes and constraints.
**Files:**
- `migrations/001_core_tables.sql`
**Design docs:** `database-design.md`
**Verification:** Run migration against a local/Docker PostgreSQL instance: `psql -f migrations/001_core_tables.sql` succeeds. Verify tables exist with `\dt`.

### Step 3: PostgreSQL Database Migration - Channels & Users
**Description:** Create migration for `channels`, `users`, `vip_actions`, and `ip_hashes` tables.
**Files:**
- `migrations/002_channels_users.sql`
**Design docs:** `database-design.md`, `trust-system-design.md`
**Verification:** Run migration after step 2: `psql -f migrations/002_channels_users.sql` succeeds. Verify all 7 tables exist.

### Step 4: PostgreSQL Database Migration - Cache & Triggers
**Description:** Create migration for `sync_cache`, `full_cache_blob` tables and the `notify_vote_change()` trigger function.
**Files:**
- `migrations/003_cache_triggers.sql`
**Design docs:** `database-design.md`, `infrastructure-design.md`
**Verification:** Run all 3 migrations in order. Insert a test vote row and confirm `pg_notify` fires (check with `LISTEN vote_changes` in psql).

### Step 5: Docker Compose - PostgreSQL & Redis Services
**Description:** Set up working PostgreSQL and Redis containers in `docker-compose.yml` with healthchecks, volumes, and init migrations.
**Files:**
- `docker-compose.yml` (postgres + redis services)
**Design docs:** `infrastructure-design.md`
**Verification:** `docker compose up postgres redis -d` starts both services. `docker compose exec postgres psql -U realtube -c '\dt'` shows all tables. `docker compose exec redis redis-cli ping` returns PONG.

### Step 6: Go Backend - Project Scaffold
**Description:** Initialize the Go module with Fiber, set up the project directory structure, config loading from environment variables, and a minimal `main.go` that starts an HTTP server.
**Files:**
- `realtube-go/go.mod`, `realtube-go/go.sum`
- `realtube-go/cmd/server/main.go`
- `realtube-go/internal/config/config.go`
- `realtube-go/Dockerfile`
**Design docs:** `go-backend-design.md`
**Verification:** `cd realtube-go && go build ./cmd/server` compiles. Docker build succeeds: `docker build -t realtube-go ./realtube-go`.

### Step 7: Python Backend - Project Scaffold
**Description:** Initialize the Python project with FastAPI, pydantic-settings config, and a minimal `main.py` that starts a uvicorn server.
**Files:**
- `realtube-python/pyproject.toml`, `realtube-python/requirements.txt`
- `realtube-python/app/main.py`
- `realtube-python/app/config.py`
- `realtube-python/Dockerfile`
**Design docs:** `python-backend-design.md`
**Verification:** `cd realtube-python && pip install -r requirements.txt && python -m uvicorn app.main:app --port 8081` starts. Docker build succeeds: `docker build -t realtube-python ./realtube-python`.

### Step 8: Go Backend - Database Connection Pool
**Description:** Add `pgx` connection pool setup with retry logic, health check ping, and graceful shutdown.
**Files:**
- `realtube-go/internal/db/pool.go`
**Design docs:** `go-backend-design.md`, `infrastructure-design.md`
**Verification:** `go build ./...` succeeds. With PostgreSQL running, the backend starts and logs "database connected".

### Step 9: Python Backend - Database Connection Pool
**Description:** Add `asyncpg` connection pool setup with retry logic and lifespan events for startup/shutdown.
**Files:**
- `realtube-python/app/db/database.py`
- `realtube-python/app/dependencies.py`
**Design docs:** `python-backend-design.md`, `infrastructure-design.md`
**Verification:** `python -c "from app.db.database import ..."` imports without error. With PostgreSQL running, the backend starts and logs "database connected".

---

## Phase 2: Go Backend - Core API

### Step 10: Go Backend - Models
**Description:** Define all Go structs for videos, votes, channels, users, and API response types.
**Files:**
- `realtube-go/internal/model/video.go`
- `realtube-go/internal/model/vote.go`
- `realtube-go/internal/model/channel.go`
- `realtube-go/internal/model/user.go`
**Design docs:** `api-contract.md`, `database-design.md`
**Verification:** `go build ./...` succeeds. `go vet ./...` passes.

### Step 11: Go Backend - Hash Utilities
**Description:** Implement SHA256 hashing utilities for video ID hash-prefix lookups and user ID hashing.
**Files:**
- `realtube-go/pkg/hash/hash.go`
- `realtube-go/pkg/hash/hash_test.go`
**Design docs:** `security-design.md`, `api-contract.md`
**Verification:** `go test ./pkg/hash/...` passes. Test covers: hash prefix generation, iterated SHA256 for user IDs.

### Step 12: Go Backend - Video Repository & Handler
**Description:** Implement video DB queries (hash-prefix lookup, direct lookup) and the Fiber handler for `GET /api/videos/:hashPrefix` and `GET /api/videos?videoId=X`.
**Files:**
- `realtube-go/internal/repository/video_repo.go`
- `realtube-go/internal/handler/video.go`
- `realtube-go/internal/service/video_svc.go`
**Design docs:** `api-contract.md`, `go-backend-design.md`
**Verification:** With database seeded with test data, `curl http://localhost:8080/api/videos/<prefix>` returns matching videos. `go test ./internal/handler/...` passes.

### Step 13: Go Backend - Vote Repository & Handler
**Description:** Implement vote submission (`POST /api/votes`) and deletion (`DELETE /api/votes`) with atomic SQL, duplicate handling, and trust weight capture.
**Files:**
- `realtube-go/internal/repository/vote_repo.go`
- `realtube-go/internal/handler/vote.go`
- `realtube-go/internal/service/vote_svc.go`
**Design docs:** `api-contract.md`, `trust-system-design.md`, `infrastructure-design.md` (concurrency)
**Verification:** `curl -X POST http://localhost:8080/api/votes -d '{"videoId":"test","category":"fully_ai","userId":"abc"}'` returns success. Duplicate vote returns updated vote. `go test ./internal/handler/...` passes.

### Step 14: Go Backend - Trust Score Service
**Description:** Implement the trust score algorithm: age factor (30%), accuracy factor (50%), volume factor (20%). Compute effective vote weight.
**Files:**
- `realtube-go/internal/service/trust_svc.go`
- `realtube-go/internal/service/trust_svc_test.go`
**Design docs:** `trust-system-design.md`
**Verification:** `go test ./internal/service/...` passes with table-driven tests covering: new user (low trust), veteran accurate user (high trust), VIP multiplier, shadowbanned user (0 weight).

### Step 15: Go Backend - Video Score Recalculation
**Description:** Implement the score recalculation logic: per-category weighted scores, overall video score as max across categories. Wire into vote handler to trigger after vote insertion.
**Files:**
- `realtube-go/internal/service/score_svc.go`
- `realtube-go/internal/service/score_svc_test.go`
**Design docs:** `trust-system-design.md` (sections 9, 11)
**Verification:** `go test ./internal/service/...` passes. After submitting votes via API, video score updates correctly.

### Step 16: Go Backend - Channel Repository & Handler
**Description:** Implement channel lookup (`GET /api/channels/:channelId`) and the channel aggregation algorithm.
**Files:**
- `realtube-go/internal/repository/channel_repo.go`
- `realtube-go/internal/handler/channel.go`
- `realtube-go/internal/service/channel_svc.go`
**Design docs:** `api-contract.md`, `trust-system-design.md` (section 10)
**Verification:** `curl http://localhost:8080/api/channels/UCtest` returns channel data. `go test ./internal/service/...` passes for channel aggregation.

### Step 17: Go Backend - User Info & Stats Handlers
**Description:** Implement `GET /api/users/:userId` and `GET /api/stats` endpoints.
**Files:**
- `realtube-go/internal/repository/user_repo.go`
- `realtube-go/internal/handler/user.go`
- `realtube-go/internal/handler/stats.go`
**Design docs:** `api-contract.md`
**Verification:** `curl http://localhost:8080/api/users/<id>` returns user info. `curl http://localhost:8080/api/stats` returns aggregate statistics. `go test ./internal/handler/...` passes.

### Step 18: Go Backend - Delta Sync & Full Sync Handlers
**Description:** Implement `GET /api/sync/delta?since=TIMESTAMP` and `GET /api/sync/full` for client cache synchronization.
**Files:**
- `realtube-go/internal/handler/sync.go`
- `realtube-go/internal/service/sync_svc.go`
**Design docs:** `api-contract.md`, `infrastructure-design.md` (caching)
**Verification:** `curl http://localhost:8080/api/sync/delta?since=2026-01-01T00:00:00Z` returns changed videos. `curl http://localhost:8080/api/sync/full` returns complete dataset. `go test ./internal/handler/...` passes.

### Step 19: Go Backend - Router & Middleware Stack
**Description:** Wire all handlers into the Fiber router. Add CORS, request logging, panic recovery middleware.
**Files:**
- `realtube-go/internal/router/router.go`
- `realtube-go/internal/middleware/cors.go`
- `realtube-go/internal/middleware/logging.go`
**Design docs:** `go-backend-design.md`, `security-design.md`
**Verification:** All endpoints accessible via curl. Request logs appear in structured JSON format. CORS headers present in responses.

### Step 20: Go Backend - Rate Limiting Middleware
**Description:** Implement per-IP and per-user rate limiting middleware matching the API contract limits.
**Files:**
- `realtube-go/internal/middleware/ratelimit.go`
- `realtube-go/internal/middleware/ratelimit_test.go`
**Design docs:** `api-contract.md` (section 5.3), `security-design.md`
**Verification:** Rapid-fire requests to `/api/votes` hit 429 after 10 requests/minute. Rate limits per endpoint match the design doc. `go test ./internal/middleware/...` passes.

### Step 21: Go Backend - Redis Cache Service
**Description:** Add Redis client, implement cache-aside pattern for video/channel lookups, and write-through invalidation on vote submission.
**Files:**
- `realtube-go/internal/service/cache_svc.go`
**Design docs:** `infrastructure-design.md` (section 12)
**Verification:** First video lookup hits DB, second hits Redis cache. After a vote, Redis key is deleted and next read re-populates from DB. `go test ./internal/service/...` passes.

### Step 22: Go Backend - Health Check Endpoints
**Description:** Implement `GET /health/live` and `GET /health/ready` with DB and Redis connectivity checks.
**Files:**
- `realtube-go/internal/handler/health.go`
**Design docs:** `infrastructure-design.md` (section 23)
**Verification:** `curl http://localhost:8080/health/live` returns `{"status":"ok"}`. `curl http://localhost:8080/health/ready` returns status with DB and Redis latency. Stopping Redis makes ready endpoint report degraded.

### Step 23: Go Backend - Graceful Shutdown
**Description:** Implement signal handling for SIGTERM: stop accepting connections, drain in-flight requests, flush pending work, close DB/Redis pools.
**Files:**
- Update `realtube-go/cmd/server/main.go`
**Design docs:** `infrastructure-design.md` (section 23)
**Verification:** Start server, send requests, send SIGTERM. In-flight requests complete, server exits cleanly with code 0.

---

## Phase 3: Python Backend - Mirror API

### Step 24: Python Backend - Models (Pydantic)
**Description:** Define all Pydantic models for request/response validation matching the Go backend models exactly.
**Files:**
- `realtube-python/app/models/video.py`
- `realtube-python/app/models/vote.py`
- `realtube-python/app/models/channel.py`
- `realtube-python/app/models/user.py`
**Design docs:** `api-contract.md`, `database-design.md`
**Verification:** `python -c "from app.models.video import VideoResponse; print(VideoResponse.model_json_schema())"` outputs valid schema matching API contract.

### Step 25: Python Backend - Video Router
**Description:** Implement `GET /api/videos/:hashPrefix` and `GET /api/videos?videoId=X` with asyncpg queries.
**Files:**
- `realtube-python/app/routers/videos.py`
- `realtube-python/app/db/queries/videos.sql`
- `realtube-python/app/services/video_service.py`
**Design docs:** `api-contract.md`, `python-backend-design.md`
**Verification:** `curl http://localhost:8081/api/videos/<prefix>` returns same format as Go backend. `pytest tests/test_videos.py` passes.

### Step 26: Python Backend - Vote Router
**Description:** Implement `POST /api/votes` and `DELETE /api/votes` with the same atomic SQL as Go.
**Files:**
- `realtube-python/app/routers/votes.py`
- `realtube-python/app/db/queries/votes.sql`
- `realtube-python/app/services/vote_service.py`
**Design docs:** `api-contract.md`, `trust-system-design.md`
**Verification:** `curl -X POST http://localhost:8081/api/votes -d '...'` returns same response as Go backend. `pytest tests/test_votes.py` passes.

### Step 27: Python Backend - Trust & Score Services
**Description:** Port the trust score algorithm and video score recalculation from Go to Python.
**Files:**
- `realtube-python/app/services/trust_service.py`
- `realtube-python/app/services/score_service.py`
- `realtube-python/tests/unit/test_trust_service.py`
**Design docs:** `trust-system-design.md`
**Verification:** `pytest tests/unit/test_trust_service.py` passes with same test cases as Go. Trust scores match between backends for identical inputs.

### Step 28: Python Backend - Channel, User, Stats, Sync Routers
**Description:** Implement remaining API endpoints: channels, users, stats, delta sync, full sync.
**Files:**
- `realtube-python/app/routers/channels.py`
- `realtube-python/app/routers/users.py`
- `realtube-python/app/routers/stats.py`
- `realtube-python/app/routers/sync.py`
- `realtube-python/app/services/channel_service.py`
**Design docs:** `api-contract.md`, `trust-system-design.md`, `infrastructure-design.md`
**Verification:** All endpoints return same format as Go backend. `pytest tests/` passes for all routes.

### Step 29: Python Backend - Redis Cache, Rate Limiting, Health Checks
**Description:** Add Redis caching, rate limiting middleware, and health check endpoints to match Go backend.
**Files:**
- `realtube-python/app/services/cache_service.py`
- `realtube-python/app/middleware/ratelimit.py`
- `realtube-python/app/routers/health.py`
**Design docs:** `infrastructure-design.md`, `api-contract.md`
**Verification:** Cache behavior matches Go backend. Rate limits match design doc. `curl http://localhost:8081/health/ready` returns healthy status.

---

## Phase 4: Infrastructure & Extension

> **Note:** For all extension UI steps (32–38), use the `/frontend-design` skill to generate high-quality, polished UI components.

### Step 30: Docker Compose - Full Stack
**Description:** Complete `docker-compose.yml` with Go backend, Python backend, and db-exporter services. All services start and connect.
**Files:**
- `docker-compose.yml` (complete)
**Design docs:** `infrastructure-design.md` (section 15)
**Verification:** `docker compose up -d` starts all 5 services. `docker compose ps` shows all healthy. Both backends respond to `/health/ready`.

### Step 31: NGINX Reverse Proxy Configuration
**Description:** Create NGINX config with upstream routing, rate limiting zones, proxy caching, and the `/py/api/` prefix for Python backend.
**Files:**
- `nginx/nginx.conf`
- Update `docker-compose.yml` to add nginx service
**Design docs:** `infrastructure-design.md` (sections 12, 15)
**Verification:** `docker compose up -d`. `curl http://localhost/api/health/live` routes to Go backend. `curl http://localhost/py/api/health/live` routes to Python backend. Cache headers present on cached endpoints.

### Step 32: Extension - Project Scaffold & Build System
**Description:** Initialize the browser extension project with TypeScript, Webpack/Vite, and manifest files for Chrome (MV3) and Firefox (MV2 fallback).
**Files:**
- `realtube-extension/package.json`
- `realtube-extension/tsconfig.json`
- `realtube-extension/webpack.config.js` (or `vite.config.ts`)
- `realtube-extension/src/manifest.chrome.json`
- `realtube-extension/src/manifest.firefox.json`
**Design docs:** `extension-design.md` (section 4.5)
**Verification:** `cd realtube-extension && npm install && npm run build` produces `dist/chrome/` and `dist/firefox/` directories with valid manifest.json files.

### Step 33: Extension - Background Service Worker
**Description:** Implement the background worker: message hub, API client with retry/backoff, and local ID generation (UUID + SHA256 hashing).
**Files:**
- `realtube-extension/src/background/background.ts`
- `realtube-extension/src/background/api-client.ts`
- `realtube-extension/src/background/identity.ts`
**Design docs:** `extension-design.md` (section 4.2), `security-design.md`
**Verification:** Extension loads in Chrome without errors. Background worker generates and persists a user ID. Console shows "RealTube background worker started".

### Step 34: Extension - IndexedDB Cache Layer
**Description:** Implement the local IndexedDB cache for flagged videos and channels, with delta sync and full refresh logic.
**Files:**
- `realtube-extension/src/background/cache.ts`
- `realtube-extension/src/background/sync.ts`
**Design docs:** `extension-design.md` (section 4.2), `infrastructure-design.md` (section 12)
**Verification:** Cache stores and retrieves video data. Delta sync fetches changes from API. Full sync rebuilds cache. `npm test -- cache.test.ts` passes.

### Step 35: Extension - Content Script (Video Detection & Hiding)
**Description:** Implement the content script: detect page type, extract video IDs from DOM, query cache, hide flagged videos using `display:none`, set up MutationObserver for infinite scroll.
**Files:**
- `realtube-extension/src/content/content.ts`
- `realtube-extension/src/content/dom-utils.ts`
- `realtube-extension/src/content/hide.ts`
**Design docs:** `extension-design.md` (section 4.1, 20)
**Verification:** Load extension on YouTube. With test data in cache, flagged videos are hidden from feed. New videos loaded via scroll are also caught and hidden.

### Step 36: Extension - Vote Submission UI
**Description:** Inject a RealTube button into the YouTube video player controls. On click, show category selector overlay. Submit vote via background worker.
**Files:**
- `realtube-extension/src/content/vote-ui.ts`
- `realtube-extension/src/content/vote-ui.css`
**Design docs:** `extension-design.md` (section 4.1)
**Verification:** On a YouTube watch page, the RealTube button appears near the like/dislike buttons. Clicking it shows 5 category options. Selecting one and submitting sends a vote to the API.

### Step 37: Extension - Popup UI (React)
**Description:** Build the popup with status toggle, current video info, quick vote, user stats, and cache info.
**Files:**
- `realtube-extension/src/popup/popup.tsx`
- `realtube-extension/src/popup/components/StatusBar.tsx`
- `realtube-extension/src/popup/components/QuickVote.tsx`
- `realtube-extension/src/popup/components/UserStats.tsx`
- `realtube-extension/src/popup/components/CacheInfo.tsx`
- `realtube-extension/src/popup/popup.html`
**Design docs:** `extension-design.md` (section 4.3)
**Verification:** Click extension icon. Popup shows enable/disable toggle, user trust score, cache stats. On a video page, current video AI score and quick vote buttons are displayed.

### Step 38: Extension - Options Page (React)
**Description:** Build the options page with category threshold settings, appearance, privacy, and advanced sections.
**Files:**
- `realtube-extension/src/options/options.tsx`
- `realtube-extension/src/options/options.html`
**Design docs:** `extension-design.md` (section 4.4)
**Verification:** Open extension options. All settings sections render. Changing a category threshold saves to `chrome.storage.sync` and is reflected in content script behavior.

---

## Phase 5: Hardening & Public API

### Step 39: API Contract Test Suite
**Description:** Create language-agnostic HTTP test files (using Hurl or plain curl scripts) that both backends must pass identically.
**Files:**
- `tests/api-contract/test_videos.hurl`
- `tests/api-contract/test_votes.hurl`
- `tests/api-contract/test_channels.hurl`
- `tests/api-contract/test_sync.hurl`
- `tests/api-contract/test_ratelimits.hurl`
- `tests/api-contract/run_tests.sh`
**Design docs:** `api-contract.md`, `design-overview.md` (section 18)
**Verification:** `./tests/api-contract/run_tests.sh http://localhost:8080` passes for Go backend. Same script with `http://localhost:8081` passes for Python backend.

### Step 40: Database Export Service
**Description:** Implement the `GET /api/database/export` endpoint and configure the `db-exporter` Docker service for daily dumps.
**Files:**
- Update Go handler: `realtube-go/internal/handler/export.go`
- Update Python router: `realtube-python/app/routers/export.py`
- `scripts/db-export.sh`
**Design docs:** `public-api-docs.md`, `infrastructure-design.md`
**Verification:** `curl http://localhost:8080/api/database/export -o dump.sql.gz` downloads a valid gzipped SQL dump. Export excludes IP hashes and shadowban details.

### Step 41: Channel Auto-Flag Background Job
**Description:** Implement the periodic background job (every 15 minutes) that recalculates channel scores and sets `auto_flag_new` when thresholds are met.
**Files:**
- `realtube-go/internal/service/channel_worker.go`
- `realtube-python/app/services/channel_worker.py`
**Design docs:** `trust-system-design.md` (section 10)
**Verification:** Insert enough flagged videos for a channel. Wait for or trigger the background job. Channel `auto_flag_new` becomes true. New video from that channel gets preliminary score of 60%.

### Step 42: Async Score Recalculation Worker (LISTEN/NOTIFY)
**Description:** Implement the PostgreSQL LISTEN/NOTIFY background worker that batches and processes score recalculations triggered by votes.
**Files:**
- `realtube-go/internal/service/score_worker.go`
- `realtube-python/app/services/score_worker.py`
**Design docs:** `infrastructure-design.md` (section 14)
**Verification:** Submit multiple rapid votes on the same video. Worker batches them and recalculates once. Score updates within 10 seconds.

### Step 43: Security Hardening - Input Validation & Error Format
**Description:** Ensure all API inputs are validated (video ID length, category enum, user ID format). Standardize error responses to match the API contract error format.
**Files:**
- `realtube-go/internal/middleware/validation.go`
- `realtube-python/app/middleware/validation.py`
**Design docs:** `security-design.md`, `api-contract.md` (section 5.4)
**Verification:** Invalid inputs return proper 400 errors with `{"error":{"code":"...","message":"..."}}` format. SQL injection attempts are rejected. `go test` and `pytest` pass.

### Step 44: Extension - Shorts Support
**Description:** Add specific handling for YouTube Shorts: detect `ytd-reel-video-renderer`, intercept and skip flagged Shorts, handle the Shorts player's unique DOM structure.
**Files:**
- `realtube-extension/src/content/shorts.ts`
- Update `realtube-extension/src/content/content.ts`
**Design docs:** `extension-design.md` (section 4.1)
**Verification:** Navigate to YouTube Shorts. Flagged Shorts are skipped or hidden. Regular video handling is unaffected.

### Step 45: Extension - Offline Vote Queue
**Description:** Implement offline vote queuing in IndexedDB. When offline, votes are stored locally and flushed when connectivity returns.
**Files:**
- `realtube-extension/src/background/offline-queue.ts`
- Update `realtube-extension/src/background/api-client.ts`
**Design docs:** `extension-design.md` (section 4.2), `infrastructure-design.md`
**Verification:** Disable network, submit a vote, re-enable network. Vote is sent to server within 30 seconds of reconnection.

### Step 46: Structured Logging (Both Backends)
**Description:** Add structured JSON logging with `zerolog` (Go) and `structlog` (Python). Log all requests with method, path, status, duration, and anonymized identifiers.
**Files:**
- Update `realtube-go/internal/middleware/logging.go`
- `realtube-python/app/middleware/logging.py`
**Design docs:** `infrastructure-design.md` (section 22)
**Verification:** Make API requests. Both backends output structured JSON logs matching the design doc format. Log levels are configurable via `LOG_LEVEL` env var.

### Step 47: Prometheus Metrics Endpoint
**Description:** Add `/metrics` endpoint to both backends exposing vote counters, request duration histograms, cache hit ratios, and connection pool gauges.
**Files:**
- `realtube-go/internal/handler/metrics.go`
- `realtube-python/app/routers/metrics.py`
**Design docs:** `infrastructure-design.md` (section 22)
**Verification:** `curl http://localhost:8080/metrics` returns Prometheus-formatted metrics. After some API traffic, counters and histograms show non-zero values.

### Step 48: End-to-End Integration Test
**Description:** Create a script that brings up the full Docker Compose stack, seeds test data, verifies video hiding via the extension APIs, submits votes, checks score updates, and validates delta sync.
**Files:**
- `tests/e2e/run_e2e.sh`
- `tests/e2e/seed_data.sql`
**Design docs:** `design-overview.md` (section 18)
**Verification:** `./tests/e2e/run_e2e.sh` runs end-to-end against Docker Compose stack and exits 0 with all assertions passing.
