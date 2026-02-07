# RealTube - Project Instructions

## What is RealTube?

RealTube is a crowdsourced browser extension that lets the community flag AI-generated YouTube videos and channels. Flagged content is hidden from the user's feed, search results, and recommendations. Inspired by SponsorBlock's proven architecture.

## Monorepo Structure

```
RealTube/
  realtube-go/          # Go backend (Fiber) - primary API server
  realtube-python/      # Python backend (FastAPI) - secondary API / future ML
  realtube-extension/   # Browser extension (TypeScript + React)
  migrations/           # Shared PostgreSQL migrations
  nginx/                # NGINX reverse proxy config
  docker-compose.yml    # Full stack orchestration
  docs/design/          # Design documents
  docs/                 # Implementation plan & status
```

## How to Continue Implementation

Use `/implement` to check current progress and implement the next step. The skill reads the plan and status files, picks the next pending step, implements it, verifies it, and updates the tracker.

You can also run `/implement 15` to jump to a specific step number.

## Design Documents

Before implementing any component, read the relevant design doc:

| Document | Purpose |
|----------|---------|
| `docs/design/design-overview.md` | Context, product, architecture, future, testing, docs |
| `docs/design/extension-design.md` | Extension internals + performance |
| `docs/design/api-contract.md` | All endpoints, rate limits, errors |
| `docs/design/go-backend-design.md` | Go project structure, deps, middleware |
| `docs/design/python-backend-design.md` | Python project structure, deps, ML |
| `docs/design/database-design.md` | Full schema, indexes, triggers |
| `docs/design/trust-system-design.md` | Voting, trust, channels, categories |
| `docs/design/infrastructure-design.md` | Caching, concurrency, Docker, containers, logging, health |
| `docs/design/security-design.md` | Privacy, security, abuse vectors |
| `docs/design/public-api-docs.md` | Public API, DB export, third-party |

## Key Design Decisions

- Both Go and Python backends implement the **same API contract** (see `api-contract.md`)
- Anonymous users: extension generates UUID, hashed 5000x with SHA256 before sending to server
- Hash-prefix video lookups for privacy (client sends prefix of SHA256(videoId))
- 5 AI categories: `fully_ai`, `ai_voiceover`, `ai_visuals`, `ai_thumbnails`, `ai_assisted`
- Trust score = (age 30%) + (accuracy 50%) + (volume 20%)
- PostgreSQL is source of truth; Redis is cache; NGINX handles rate limiting + proxy caching
