# RealTube - Design Overview

## Document Structure

This design is split into a main overview and 9 sub-documents for focused sub-agent work during implementation. Each sub-document maps to a standalone file in `docs/design/`.

| # | Sub-Document | Sections | Purpose |
|---|-------------|----------|---------|
| - | **This file** (`design-overview.md`) | 1-3, 17, 18, 24 | Context, product, architecture, future, testing, docs |
| 1 | `extension-design.md` | 4, 20 | Extension internals + performance |
| 2 | `api-contract.md` | 5 | All endpoints, rate limits, errors |
| 3 | `go-backend-design.md` | 6 | Go project structure, deps, middleware |
| 4 | `python-backend-design.md` | 7 | Python project structure, deps, ML |
| 5 | `database-design.md` | 8 | Full schema, indexes, triggers |
| 6 | `trust-system-design.md` | 9, 10, 11 | Voting, trust, channels, categories |
| 7 | `infrastructure-design.md` | 12, 14, 15, 21, 22, 23 | Caching, concurrency, Docker, containers, logging, health |
| 8 | `security-design.md` | 13, 19 | Privacy, security, abuse vectors |
| 9 | `public-api-docs.md` | 16 | Public API, DB export, third-party |

---

## 1. Context & Motivation

### Problem

AI-generated "slop" content is flooding YouTube at an alarming rate. Studies show 20%+ of videos shown to new users are AI-generated. YouTube provides no built-in filter, and existing tools like "Do not recommend channel" are insufficient. The algorithm actively amplifies AI content once a user accidentally watches one.

### Affected Users

- **New YouTube users** with uncurated algorithms
- **Older/less tech-savvy users** who can't distinguish AI from real content
- **Children** targeted by AI-generated kids content
- **Niche communities** (history, travel, ASMR, pets, music) being drowned out
- **Small creators** losing visibility to AI slop farms pumping 2-3 videos/day

### Solution

RealTube is a crowdsourced browser extension that lets the community flag AI-generated YouTube videos and channels. Flagged content is hidden from the user's feed, search results, and recommendations. Inspired by SponsorBlock's proven architecture, but targeting entire videos/channels instead of sponsor segments.

### Differentiation from SlopBlock (existing competitor)

| Aspect | SlopBlock | RealTube |
|--------|-----------|----------|
| Browsers | Chromium only | Chrome, Firefox, Safari, Edge |
| Backend | Supabase (managed) | Self-hosted Go + Python |
| AI detection | Binary (yes/no) | 5 categories + confidence % |
| Channel detection | None | Auto-aggregate from videos |
| Data retention | 48-hour window | Full historical data |
| Default behavior | Warning icons | Hide completely |
| Public API | No | Yes, with database export |
| Trust system | Time + accuracy | Multi-factor with VIP moderation |

---

## 2. Product Overview

### Key Features

1. **Hide AI videos** -- Remove flagged videos from feed, search, recommendations, and Shorts
2. **Crowdsourced voting** -- Users flag videos with AI category and the community validates
3. **Channel-level detection** -- Channels auto-flagged when threshold of their videos are flagged
4. **5 AI categories** -- Fully AI, AI voiceover, AI visuals, AI thumbnails, AI-assisted
5. **Confidence score** -- 0-100% score computed from weighted community votes
6. **Multi-browser** -- Chrome, Firefox, Safari, Edge from day one
7. **YouTube Shorts** -- Full support alongside regular videos
8. **Public API** -- Open REST API with downloadable database for third-party integrations
9. **Privacy-first** -- Anonymous IDs, hash-prefix lookups, no personal data

### User Flows

**Passive user (consumer):**
1. Install extension
2. Browse YouTube normally
3. AI-flagged videos are automatically hidden from feed/search/recommendations
4. Optionally adjust settings (show warnings instead of hiding, configure category thresholds)

**Active user (reporter):**
1. Encounter suspected AI video
2. Click RealTube button on video player
3. Select AI category (fully AI, AI voiceover, etc.)
4. Submit vote
5. Vote is weighted by user's trust score and aggregated with other votes

**Power user (VIP/moderator):**
1. Earned through consistent accurate reporting
2. Single vote can lock/unlock video flags
3. Can override community votes on disputed content
4. Access to moderation dashboard

---

## 3. System Architecture Overview

```
                         USERS (Browsers)
                              |
            +--------+--------+--------+--------+
            |        |        |        |        |
         Chrome   Firefox   Safari    Edge    Third-party
            |        |        |        |        clients
            +--------+--------+--------+--------+
                              |
                      [ NGINX Reverse Proxy ]
                       (rate limiting, cache)
                              |
                    +---------+---------+
                    |                   |
             [ Go Backend ]    [ Python Backend ]
              (Fiber)           (FastAPI)
              Primary           Secondary / ML
                    |                   |
                    +---------+---------+
                              |
                    +---------+---------+
                    |                   |
              [ PostgreSQL ]      [ Redis Cache ]
              (primary DB)        (hot data cache)
                    |
              [ DB Export ]
              (pg_dump / rsync)
```

### Component Responsibilities

| Component | Role | Design Doc |
|-----------|------|------------|
| **Extension (Content Script)** | Injects into YouTube, hides flagged videos, captures votes | `extension-design.md` |
| **Extension (Background Worker)** | Message hub, API client, local cache management | `extension-design.md` |
| **Extension (Popup)** | Quick voting UI, stats display, manual cache refresh | `extension-design.md` |
| **Extension (Options)** | Settings, category preferences, trust score display | `extension-design.md` |
| **NGINX** | Reverse proxy, TLS, rate limiting, response caching | `infrastructure-design.md` |
| **Go Backend (Fiber)** | Primary API server, high throughput | `go-backend-design.md` |
| **Python Backend (FastAPI)** | Secondary API server, future ML integration | `python-backend-design.md` |
| **PostgreSQL** | Persistent storage for all data | `database-design.md` |
| **Redis** | Caching layer for hot video lookups | `infrastructure-design.md` |

---

## 17. Future Considerations

### ML-Based Automated Detection (Python backend advantage)

The Python backend's `app/ml/` module is designed for future expansion:
- **Audio fingerprinting**: Detect common AI voice patterns (ElevenLabs, etc.)
- **Visual analysis**: Detect AI artifacts in thumbnails and video frames
- **Metadata heuristics**: Channel age vs upload frequency, description patterns
- **Ensemble scoring**: Combine ML predictions with community votes for higher accuracy

### Platform Expansion

- **TikTok**: Same crowdsourced model, different content script
- **Instagram Reels**: Facebook/Meta integration
- **X/Twitter**: Video content detection

### Mobile Support

- Android: via Firefox for Android extension support
- iOS: Safari Web Extension
- Standalone companion apps using public API

### Browser-Native Proposals

- Propose to browser vendors: native "AI content" metadata in HTML
- Push for YouTube to expose AI labels in their API
- Work with standards bodies on content authenticity markers

---

## 18. Verification & Testing Plan

### Extension Testing
- Unit tests with Jest for utility functions and business logic
- Integration tests using Puppeteer/Playwright for YouTube DOM manipulation
- Manual testing across Chrome, Firefox, Safari, Edge
- Test Shorts handling separately from regular videos

### Backend Testing
- Go: `go test ./...` with table-driven tests for all handlers
- Python: `pytest` with async test support for all routes
- Both backends should pass identical API contract tests (shared test suite)
- Load testing with k6 or wrk to verify performance under traffic

### End-to-End Testing
1. Start Docker Compose stack
2. Install extension in test browser
3. Navigate to YouTube with known AI videos in database
4. Verify videos are hidden from feed
5. Submit a vote, verify score updates
6. Check delta sync picks up new data
7. Verify channel aggregation triggers correctly
8. Test offline vote queuing and sync

### Database Testing
- Migration tests (up and down)
- Verify all indexes are used by common queries (EXPLAIN ANALYZE)
- Test constraint enforcement (duplicate votes, foreign keys)

### Shared API Contract Tests

Both Go and Python backends must pass identical contract tests using language-agnostic HTTP testing (Hurl or Bruno):

```
tests/api-contract/
  test_videos.http
  test_votes.http
  test_channels.http
  test_sync.http
  test_ratelimits.http
```

### Go Test Structure

```
realtube-go/internal/
  handler/*_test.go          # Handler unit tests (mock service layer)
  service/*_test.go          # Trust algorithm, vote processing (table-driven)
  repository/*_test.go       # DB integration tests (testcontainers-go with real PG)
  cmd/server/integration_test.go  # Full API integration tests
```

### Python Test Structure

```
realtube-python/tests/
  unit/
    test_trust_service.py    # Trust algorithm with pytest parametrize
    test_vote_service.py
    test_channel_service.py
  integration/
    test_videos_api.py       # FastAPI TestClient
    test_votes_api.py
    conftest.py              # Fixtures: test DB, Redis mock
  load/
    locustfile.py            # Load testing with Locust
```

### Extension Test Structure

```
realtube-extension/tests/
  unit/
    cache.test.ts            # IndexedDB cache logic
    scoring.test.ts          # Client-side score filtering
    domUtils.test.ts         # Video ID extraction from DOM
  integration/
    youtube-feed.test.ts     # Puppeteer: verify videos hidden on feed
    youtube-shorts.test.ts   # Puppeteer: verify shorts handling
    voting-flow.test.ts      # Puppeteer: vote submission E2E
```

---

## 24. Documentation Plan

### Repository Structure for Docs

```
realtube/
├── README.md                           # Project overview + quickstart
├── CONTRIBUTING.md                     # How to contribute
├── SECURITY.md                         # Security policy + responsible disclosure
├── ROADMAP.md                          # Future considerations + milestones
├── LICENSE                             # License file (AGPL-3.0 or GPL-3.0)
├── docs/
│   ├── design/                         # Design sub-documents (from this plan)
│   │   ├── design-overview.md
│   │   ├── extension-design.md
│   │   ├── api-contract.md
│   │   ├── go-backend-design.md
│   │   ├── python-backend-design.md
│   │   ├── database-design.md
│   │   ├── trust-system-design.md
│   │   ├── infrastructure-design.md
│   │   ├── security-design.md
│   │   └── public-api-docs.md
│   ├── setup/
│   │   ├── quickstart.md              # 5-minute local setup guide
│   │   ├── docker-deployment.md       # Full Docker Compose deployment
│   │   ├── production-deployment.md   # Production hardening guide
│   │   └── environment-variables.md   # All config options documented
│   ├── api/
│   │   ├── overview.md                # API design principles, auth model
│   │   ├── endpoints.md               # Full endpoint reference
│   │   ├── rate-limits.md             # Rate limiting policies
│   │   └── openapi.yaml               # Auto-generated OpenAPI spec
│   ├── architecture/
│   │   ├── overview.md                # System architecture diagram
│   │   ├── extension.md               # Extension internals
│   │   ├── trust-system.md            # Trust & reputation algorithm details
│   │   ├── concurrency.md             # Data consistency model
│   │   └── caching.md                 # Multi-layer caching strategy
│   └── security/
│       ├── threat-model.md            # Abuse vectors and mitigations
│       ├── privacy.md                 # Data collection, hash-prefix, anonymity
│       └── incident-response.md       # What to do if the system is compromised
```

---

## Implementation Order

When implementing, the recommended order is:

1. **Database** (`database-design.md`) -- Schema first, everything depends on it
2. **Go Backend** (`go-backend-design.md` + `api-contract.md`) -- Primary API server
3. **Trust System** (`trust-system-design.md`) -- Core business logic
4. **Infrastructure** (`infrastructure-design.md`) -- Docker Compose, Redis, NGINX
5. **Extension** (`extension-design.md`) -- Client that consumes the API
6. **Python Backend** (`python-backend-design.md`) -- Mirror of Go, same contract
7. **Security hardening** (`security-design.md`) -- Abuse prevention, rate limits
8. **Public API** (`public-api-docs.md`) -- Documentation, export, third-party
