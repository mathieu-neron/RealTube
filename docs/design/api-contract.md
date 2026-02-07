# SUB-DOC 2: API Contract

## 5. API Contract

Both the Go and Python backends implement the exact same API contract.

### 5.1 Authentication Model

- **No accounts required** -- Extension generates a random 36-character UUID on first install
- **Public user ID** -- SHA256 hash of local ID (iterated 5000x), sent to server
- **Rate limiting** -- Per-IP and per-user-ID limits
- **VIP tokens** -- Manually assigned by project maintainers

### 5.2 Endpoints

#### Video Lookup

**GET /api/videos/:hashPrefix**
Privacy-preserving bulk lookup using SHA256 hash prefix of video ID.

```
Request:
  Path: hashPrefix (4-8 chars of SHA256(videoId))
  Query: ?categories=fully_ai,ai_voiceover&minScore=50

Response: 200 OK
[
  {
    "videoId": "dQw4w9WgXcQ",
    "score": 87.5,
    "categories": {
      "fully_ai": { "votes": 45, "weightedScore": 82.3 },
      "ai_voiceover": { "votes": 12, "weightedScore": 5.2 }
    },
    "totalVotes": 57,
    "locked": false,
    "channelId": "UCuAXFkgsw1L7xaCfnd5JJOw",
    "channelScore": 72.1,
    "lastUpdated": "2026-02-06T12:00:00Z"
  }
]

Response: 404 -- No flagged videos matching prefix
```

**GET /api/videos?videoId=X**
Direct lookup (less private, for third-party API consumers).

```
Response: Same as above but for exact video ID
```

#### Vote Submission

**POST /api/votes**
Submit a vote on a video.

```
Request:
{
  "videoId": "dQw4w9WgXcQ",
  "category": "fully_ai",
  "userId": "hashed-user-id",
  "userAgent": "RealTube/1.0.0 Chrome"
}

Response: 200 OK
{
  "success": true,
  "newScore": 87.5,
  "userTrust": 0.85
}

Error: 429 Too Many Requests (rate limited)
Error: 400 Bad Request (invalid category, duplicate vote)
```

**DELETE /api/votes**
Remove a previously submitted vote.

```
Request:
{
  "videoId": "dQw4w9WgXcQ",
  "userId": "hashed-user-id"
}

Response: 200 OK
```

#### Channel Lookup

**GET /api/channels/:channelId**
Get channel-level AI score.

```
Response: 200 OK
{
  "channelId": "UCuAXFkgsw1L7xaCfnd5JJOw",
  "score": 72.1,
  "totalVideos": 150,
  "flaggedVideos": 108,
  "topCategories": ["fully_ai", "ai_voiceover"],
  "locked": false,
  "lastUpdated": "2026-02-06T12:00:00Z"
}
```

#### Delta Sync

**GET /api/sync/delta?since=TIMESTAMP**
Fetch all changes since a given timestamp for client cache sync.

```
Response: 200 OK
{
  "videos": [
    { "videoId": "...", "score": 91.2, "categories": {...}, "action": "update" },
    { "videoId": "...", "action": "remove" }
  ],
  "channels": [
    { "channelId": "...", "score": 85.0, "action": "update" }
  ],
  "syncTimestamp": "2026-02-06T12:30:00Z"
}
```

#### Full Cache Blob

**GET /api/sync/full**
Download complete flagged video dataset (for initial install or full refresh).

```
Response: 200 OK (gzipped JSON or binary blob)
{
  "videos": [...],
  "channels": [...],
  "generatedAt": "2026-02-06T00:00:00Z"
}
```

#### User Info

**GET /api/users/:userId**
```
Response: 200 OK
{
  "userId": "public-hash",
  "trustScore": 0.85,
  "totalVotes": 234,
  "accuracyRate": 0.91,
  "accountAge": 45,
  "isVip": false
}
```

#### Statistics

**GET /api/stats**
```
Response: 200 OK
{
  "totalVideos": 125000,
  "totalChannels": 8500,
  "totalVotes": 2500000,
  "totalUsers": 50000,
  "activeUsers24h": 5000,
  "topCategories": {
    "fully_ai": 45000,
    "ai_voiceover": 38000,
    "ai_visuals": 22000,
    "ai_thumbnails": 15000,
    "ai_assisted": 5000
  }
}
```

#### Database Export

**GET /api/database/export**
Download full PostgreSQL database dump for mirrors/research.

```
Response: 200 OK (application/sql, gzipped)
Content-Disposition: attachment; filename="realtube-db-2026-02-06.sql.gz"
```

### 5.3 Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| GET /api/videos/* | 100 req | per minute per IP |
| POST /api/votes | 10 req | per minute per user |
| DELETE /api/votes | 5 req | per minute per user |
| GET /api/sync/* | 2 req | per minute per user |
| GET /api/stats | 10 req | per minute per IP |
| GET /api/database/export | 1 req | per hour per IP |

### 5.4 Error Format

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Try again in 45 seconds.",
    "retryAfter": 45
  }
}
```
