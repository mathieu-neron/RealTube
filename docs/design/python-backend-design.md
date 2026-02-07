# SUB-DOC 4: Python Backend Design

## 7. Python Backend (FastAPI)

### Project Structure

```
realtube-python/
├── app/
│   ├── main.py                   # FastAPI app entry point
│   ├── config.py                 # Settings via pydantic-settings
│   ├── dependencies.py           # Dependency injection (DB, Redis, etc.)
│   ├── routers/
│   │   ├── videos.py             # Video lookup routes
│   │   ├── votes.py              # Vote submission routes
│   │   ├── channels.py           # Channel lookup routes
│   │   ├── sync.py               # Delta/full sync routes
│   │   ├── users.py              # User info routes
│   │   └── stats.py              # Statistics routes
│   ├── models/
│   │   ├── video.py              # Pydantic models for videos
│   │   ├── vote.py               # Pydantic models for votes
│   │   ├── channel.py            # Pydantic models for channels
│   │   └── user.py               # Pydantic models for users
│   ├── services/
│   │   ├── video_service.py      # Video business logic
│   │   ├── vote_service.py       # Vote processing
│   │   ├── channel_service.py    # Channel aggregation
│   │   ├── trust_service.py      # Trust computation
│   │   └── cache_service.py      # Redis cache management
│   ├── db/
│   │   ├── database.py           # asyncpg connection pool
│   │   ├── queries/              # Raw SQL queries
│   │   │   ├── videos.sql
│   │   │   ├── votes.sql
│   │   │   └── channels.sql
│   │   └── migrations/           # Alembic migrations
│   └── ml/                       # Future ML integration
│       ├── detector.py           # AI content detection model
│       └── features.py           # Feature extraction
├── tests/
│   ├── test_videos.py
│   ├── test_votes.py
│   └── test_channels.py
├── Dockerfile
├── requirements.txt
└── pyproject.toml
```

### Key Dependencies

```
fastapi                  -- Web framework
uvicorn                  -- ASGI server
asyncpg                  -- Async PostgreSQL driver
redis[hiredis]           -- Redis client with C extension
pydantic                 -- Data validation
pydantic-settings        -- Configuration management
alembic                  -- Database migrations
httpx                    -- HTTP client (for testing)
pytest                   -- Testing framework
```

### Future ML Integration Point

The `app/ml/` directory is reserved for automated AI detection:
- Audio analysis (detect AI-generated voices)
- Visual analysis (detect AI-generated imagery)
- Metadata heuristics (upload frequency, channel age, description patterns)
- These would supplement (not replace) community votes
