# RealTube

**Crowdsourced detection and hiding of AI-generated YouTube content.**

![Go](https://img.shields.io/badge/Go-1.25+-00ADD8?logo=go&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

## What is RealTube?

RealTube is a browser extension backed by a crowdsourced platform that lets the community flag AI-generated YouTube videos and channels. Flagged content is automatically hidden from your feed, search results, recommendations, and Shorts. Inspired by [SponsorBlock](https://sponsor.ajay.app/)'s proven architecture.

**Key differentiators:**

- **5 AI categories** — not a binary flag, but granular classification (fully AI, AI voiceover, AI visuals, AI thumbnails, AI-assisted)
- **Multi-factor trust system** — votes are weighted by user trust scores based on account age, accuracy history, and contribution volume
- **Dual backends** — Go (Fiber v3) and Python (FastAPI) implement the same API contract
- **Privacy-first** — anonymous UUIDs, 5000x SHA256 hashing, hash-prefix lookups — no personal data collected
- **Public API & DB export** — full transparency with a daily privacy-filtered database dump

## How It Works

1. The extension detects videos on YouTube pages via `MutationObserver`
2. Cache-first lookup: IndexedDB → API with hash-prefix privacy (only a prefix of `SHA256(videoId)` is sent to the server)
3. Videos above the AI score threshold are hidden with `display: none`
4. Users vote with 5 categories; trust-weighted scoring determines the final AI score
5. Delta sync (30 min) + full sync (24 h) keep the client cache fresh

## Architecture

```
┌─────────────┐     ┌─────────┐     ┌──────────────┐     ┌────────────┐
│  Extension   │────▶│  NGINX  │────▶│  Go Backend  │────▶│ PostgreSQL │
│  (Chrome/FF) │     │  :80    │     │  :8080       │     │  :5432     │
└─────────────┘     │         │     └──────────────┘     └────────────┘
                    │         │     ┌──────────────┐     ┌────────────┐
                    │         │────▶│ Python Back.  │     │   Redis    │
                    │         │     │  :8081       │     │   :6379    │
                    └─────────┘     └──────────────┘     └────────────┘
```

### Monorepo Structure

| Directory | Description |
|-----------|-------------|
| `realtube-go/` | Go backend (Fiber v3) — primary API server |
| `realtube-python/` | Python backend (FastAPI) — secondary API / future ML |
| `realtube-extension/` | Browser extension (TypeScript + React 19) |
| `migrations/` | Shared PostgreSQL migrations (auto-run on first startup) |
| `nginx/` | NGINX reverse proxy + rate limiting + caching |
| `scripts/` | Utility scripts (DB export) |
| `tests/` | API contract tests and end-to-end tests |
| `docs/design/` | Design documents |

## AI Categories

| Category | Description |
|----------|-------------|
| `fully_ai` | Entirely AI-generated content (video, audio, script) |
| `ai_voiceover` | AI-generated narration or voice |
| `ai_visuals` | AI-generated images, animations, or video |
| `ai_thumbnails` | AI-generated thumbnail only |
| `ai_assisted` | AI tools used to assist human-created content |

## Tech Stack

| Component | Technology |
|-----------|------------|
| Primary API | Go 1.25+ / Fiber v3 |
| Secondary API | Python 3.12+ / FastAPI |
| Extension | TypeScript 5.7 / React 19 / Webpack 5 |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Reverse Proxy | NGINX (rate limiting + proxy caching) |
| Orchestration | Docker Compose |
| Metrics | Prometheus |
| Logging | zerolog (Go) / structlog (Python) |

## Prerequisites

- **Docker & Docker Compose** (required for running the full stack)
- **Git**

For local development without Docker:
- Go 1.25+
- Python 3.12+
- Node.js 18+

## Quick Start

```bash
git clone https://github.com/mathieu-neron/RealTube.git
cd RealTube
docker compose up -d --build
```

PostgreSQL migrations run automatically on first startup via files mounted to `/docker-entrypoint-initdb.d`.

Verify the stack is running:

```bash
# Health check
curl http://localhost/health/live

# Platform stats
curl http://localhost/api/stats
```

## Services & Ports

| Service | Port | Description |
|---------|------|-------------|
| NGINX | 80 | Reverse proxy, rate limiting, caching |
| Go Backend | 8080 | Primary API server |
| Python Backend | 8081 | Secondary API (accessible via `/py/api/` through NGINX) |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache |
| DB Exporter | — | Daily privacy-filtered database dump (internal cron) |

## API Endpoints

All endpoints are accessible through NGINX on port 80. The Python backend mirrors the same contract and is accessible via the `/py/api/` prefix.

| Method | Endpoint | Rate Limit | Description |
|--------|----------|------------|-------------|
| `GET` | `/health/live` | — | Liveness probe |
| `GET` | `/health/ready` | — | Readiness probe (DB + Redis) |
| `GET` | `/metrics` | — | Prometheus metrics |
| `GET` | `/api/videos/:hashPrefix` | 100/min | Hash-prefix video lookup |
| `GET` | `/api/videos?videoId=X` | 100/min | Direct video lookup |
| `POST` | `/api/votes` | 10/min | Submit a vote |
| `DELETE` | `/api/votes` | 10/min | Remove a vote |
| `GET` | `/api/channels/:channelId` | 100/min | Channel AI score |
| `GET` | `/api/users/:userId` | 100/min | User trust info |
| `GET` | `/api/stats` | 100/min | Platform-wide statistics |
| `GET` | `/api/sync/delta?since=TS` | 2/min | Incremental sync |
| `GET` | `/api/sync/full` | 2/min | Full cache blob |
| `GET` | `/api/database/export` | 1/min | Privacy-filtered DB dump |

See [`docs/design/api-contract.md`](docs/design/api-contract.md) for full request/response schemas and error formats.

## Browser Extension

### Build

```bash
cd realtube-extension
npm install
npm run build          # Both Chrome and Firefox
npm run build:chrome   # Chrome only
npm run build:firefox  # Firefox only
npm run dev            # Chrome dev mode with watch
```

### Load in Chrome

1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select `realtube-extension/dist/chrome/`

### Load in Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select any file in `realtube-extension/dist/firefox/`

### Features

- Automatic hiding of AI-flagged videos, Shorts, and channel content
- Vote UI overlay on YouTube video pages (5 AI categories)
- Offline vote queue — votes submitted while offline are synced when connectivity returns
- Popup with current page status and quick stats
- Options page for threshold, sync interval, and API server configuration
- Minimal permissions: `storage`, `scripting`, YouTube host only

## Running Tests

```bash
# API contract tests (Go backend)
./tests/api-contract/run_tests.sh http://localhost:8080

# API contract tests (Python backend)
./tests/api-contract/run_tests.sh http://localhost:8081

# End-to-end integration tests (full stack)
./tests/e2e/run_e2e.sh

# Go unit tests
cd realtube-go && go test ./...

# Python unit tests
cd realtube-python && pytest
```

## Configuration

All defaults are development-ready out of the box via `docker-compose.yml`.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://realtube:password@postgres:5432/realtube` | PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |
| `PORT` | `8080` (Go) / `8081` (Python) | Server listen port |
| `LOG_LEVEL` | `info` | Log verbosity (`debug`, `info`, `warn`, `error`) |
| `ENVIRONMENT` | `development` | Environment name (`development`, `production`) |
| `CORS_ORIGINS` | `*` | Allowed CORS origins |
| `EXPORT_DIR` | `/exports` | Directory for database export files |

## Project Structure

```
RealTube/
├── realtube-go/                 # Go backend
│   ├── cmd/server/              #   Entrypoint
│   └── internal/
│       ├── config/              #   Configuration
│       ├── db/                  #   Database connection
│       ├── handler/             #   HTTP handlers
│       ├── middleware/          #   Logging, CORS, rate limits
│       ├── model/               #   Data models
│       ├── repository/          #   Data access layer
│       ├── router/              #   Route setup
│       └── service/             #   Business logic + workers
├── realtube-python/             # Python backend
│   └── app/
│       ├── db/                  #   Database connection
│       ├── middleware/          #   Logging, rate limits
│       ├── models/              #   Pydantic models
│       ├── routers/             #   API endpoints
│       └── services/            #   Business logic + workers
├── realtube-extension/          # Browser extension
│   └── src/
│       ├── background/          #   Service worker
│       ├── content/             #   Content scripts
│       ├── popup/               #   Popup UI
│       └── options/             #   Options page
├── migrations/                  # PostgreSQL migrations
│   ├── 001_core_tables.sql
│   ├── 002_channels_users.sql
│   └── 003_cache_triggers.sql
├── nginx/                       # NGINX config
│   └── nginx.conf
├── scripts/                     # Utility scripts
│   └── db-export.sh
├── tests/
│   ├── api-contract/            # API contract tests (Bash)
│   └── e2e/                     # End-to-end tests
├── docs/design/                 # Design documents
├── exports/                     # Database export output
├── docker-compose.yml           # Full stack orchestration
└── CLAUDE.md                    # AI assistant instructions
```

## Design Documents

| Document | Purpose |
|----------|---------|
| [`design-overview.md`](docs/design/design-overview.md) | Product vision, architecture, testing strategy |
| [`api-contract.md`](docs/design/api-contract.md) | All endpoints, rate limits, error formats |
| [`go-backend-design.md`](docs/design/go-backend-design.md) | Go project structure, dependencies, middleware |
| [`python-backend-design.md`](docs/design/python-backend-design.md) | Python project structure, dependencies, ML roadmap |
| [`extension-design.md`](docs/design/extension-design.md) | Extension internals, performance, UI |
| [`database-design.md`](docs/design/database-design.md) | Full schema, indexes, triggers |
| [`trust-system-design.md`](docs/design/trust-system-design.md) | Voting, trust scoring, channels, categories |
| [`infrastructure-design.md`](docs/design/infrastructure-design.md) | Caching, concurrency, Docker, logging, health |
| [`security-design.md`](docs/design/security-design.md) | Privacy, security, abuse prevention |
| [`public-api-docs.md`](docs/design/public-api-docs.md) | Public API, DB export, third-party integration |

## Privacy & Security

- **Anonymous by design** — extension generates a random UUID, no account or login required
- **5000x SHA256 hashing** — user IDs are hashed 5000 times before being sent to the server
- **Hash-prefix lookups** — only a prefix of `SHA256(videoId)` is sent, so the server never learns exactly which video you're watching
- **No personal data** — no emails, names, browsing history, or cookies collected
- **IP hashing** — IPs are hashed for abuse prevention only, never stored in raw form
- **Minimal extension permissions** — only `storage` and `scripting` on YouTube domains

## License

TBD
