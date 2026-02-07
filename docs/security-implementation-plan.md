# RealTube Security Implementation Plan

Security hardening steps derived from comprehensive security review (2026-02-07).
Organized into 3 phases by severity. Each step is independently verifiable.

---

## Phase 1: Critical (Must Fix Before Any Deployment)

### Step S1: Fiber Trusted Proxy Configuration
**Severity:** Critical
**Description:** Configure Fiber to validate `X-Forwarded-For` headers via trusted proxy settings. Without this, attackers can spoof IPs to bypass all rate limiting.
**Files:**
- `realtube-go/cmd/server/main.go` — add `EnableTrustedProxyCheck`, `TrustedProxies` (Docker network range `172.16.0.0/12`), and `ProxyHeader` to Fiber config
**Design docs:** `security-design.md` section 13
**Verification:** `curl -H "X-Forwarded-For: 1.2.3.4" http://localhost:8080/health/live` — the Go backend should use the real client IP (not the spoofed one). Check structured logs show the NGINX proxy IP hash, not the spoofed value.

### Step S2: Replace Hardcoded Credentials with Environment Variables
**Severity:** Critical
**Description:** Remove all hardcoded passwords from `docker-compose.yml` and config files. Use `${VARIABLE}` references with a `.env.example` template.
**Files:**
- `docker-compose.yml` — replace all `password` literals with `${POSTGRES_PASSWORD}`, add `--requirepass ${REDIS_PASSWORD}` to Redis command, update all `DATABASE_URL` and `REDIS_URL` references
- `.env.example` (new) — template with placeholder values and comments
- `.gitignore` — ensure `.env` is listed (not `.env.example`)
- `realtube-python/app/config.py` — remove default password from `database_url` default value
**Design docs:** `security-design.md`, `infrastructure-design.md`
**Verification:** `docker compose config 2>&1 | grep -c "password"` returns 0. `docker compose up -d` works with a `.env` file containing the real passwords. Both backends connect successfully.

### Step S3: Redis Authentication
**Severity:** Critical
**Description:** Enable `requirepass` on Redis and update all connection URLs to include the password.
**Files:**
- `docker-compose.yml` — add `--requirepass ${REDIS_PASSWORD}` to redis command
- `docker-compose.yml` — update `REDIS_URL` env vars for both backends to `redis://:${REDIS_PASSWORD}@redis:6379`
- `.env.example` — add `REDIS_PASSWORD` placeholder
**Design docs:** `infrastructure-design.md`
**Verification:** `docker compose exec redis redis-cli PING` returns auth error. `docker compose exec redis redis-cli -a $REDIS_PASSWORD PING` returns PONG. Both backends' `/health/ready` show Redis "up".

### Step S4: NGINX PII Fix — Hash or Disable IP Logging
**Severity:** Critical
**Description:** NGINX access logs contain raw `$remote_addr`, violating the privacy model where both backends hash IPs. Disable NGINX access logs and rely on application-level structured logs (which already hash IPs).
**Files:**
- `nginx/nginx.conf` — replace `access_log /var/log/nginx/access.log main;` with `access_log off;`
**Design docs:** `security-design.md` section 13
**Verification:** `docker compose exec nginx cat /var/log/nginx/access.log` either doesn't exist or stops growing after the change. Application logs still contain hashed IPs.

### Step S5: Extension — Message Origin Validation
**Severity:** Critical
**Description:** The background service worker accepts messages from ANY source. Add sender validation to reject messages not originating from the extension's own pages/content scripts.
**Files:**
- `realtube-extension/src/background/background.ts` — validate `sender` in `onMessage` listener: accept only if `sender.id === chrome.runtime.id` (same extension)
**Design docs:** `extension-design.md`, `security-design.md`
**Verification:** `cd realtube-extension && npm run build` compiles. Manual test: a webpage calling `chrome.runtime.sendMessage(extensionId, ...)` is rejected.

### Step S6: Extension — HTTPS Default + Read Server URL from Storage
**Severity:** Critical
**Description:** `api-client.ts` hardcodes `http://localhost` and never reads the user-configured `serverUrl` from storage. Fix to use HTTPS default and read from `chrome.storage.sync`.
**Files:**
- `realtube-extension/src/background/api-client.ts` — change `DEFAULT_BASE_URL` to `https://localhost`, make `getConfig()` async to read `serverUrl` from storage, add HTTPS enforcement (reject non-https in production)
- Update all call sites of `getConfig()` to await the async result
**Design docs:** `extension-design.md`, `security-design.md`
**Verification:** `cd realtube-extension && npm run build` compiles. Setting `serverUrl` in options and reloading the extension uses the configured URL.

### Step S7: Extension — Content Security Policy in Manifests
**Severity:** Critical
**Description:** Add explicit CSP to both Chrome (MV3) and Firefox (MV2) manifests to block inline scripts, external scripts, and enforce HTTPS for `connect-src`.
**Files:**
- `realtube-extension/public/chrome/manifest.json` — add `"content_security_policy": { "extension_pages": "script-src 'self'; object-src 'none'; connect-src https: http://localhost:*;" }`
- `realtube-extension/public/firefox/manifest.json` — add `"content_security_policy": "script-src 'self'; object-src 'none'; connect-src https: http://localhost:*;"`
**Design docs:** `extension-design.md`
**Verification:** `cd realtube-extension && npm run build` produces updated manifests. Load extension in Chrome, open DevTools on extension pages — no CSP violations.

### Step S8: Python Backend — Add CORS Middleware
**Severity:** Critical
**Description:** `CORSMiddleware` is never added to the FastAPI app despite `cors_origins` existing in config. Add it with restrictive defaults.
**Files:**
- `realtube-python/app/main.py` — import `CORSMiddleware` from `fastapi.middleware.cors`, add it to middleware stack with `allow_origins` from `settings.cors_origins`, restrict `allow_methods` to `["GET", "POST", "DELETE", "OPTIONS"]`
**Design docs:** `security-design.md` section 13
**Verification:** `curl -H "Origin: https://evil.com" -I http://localhost:8081/health/live` — response should NOT include `Access-Control-Allow-Origin: https://evil.com` (unless it's in the allowed list).

---

## Phase 2: High (Fix Before Public Launch)

### Step S9: Add LIMIT Clauses to Unbounded Queries
**Severity:** High
**Description:** Multiple queries can return unbounded result sets, enabling DoS. Add reasonable `LIMIT` clauses.
**Files:**
- `realtube-go/internal/repository/video_repo.go` — add `LIMIT 1000` to hash-prefix lookup query
- `realtube-go/internal/service/sync_svc.go` — add `LIMIT 50000` to full sync video query, `LIMIT 10000` to delta sync queries
- `realtube-python/app/services/video_service.py` — add `LIMIT 1000` to hash-prefix lookup
- `realtube-python/app/routers/sync.py` — add `LIMIT 50000` to full sync, `LIMIT 10000` to delta sync
**Design docs:** `api-contract.md`, `database-design.md`
**Verification:** Both backends build/start. API contract tests still pass. Full sync response includes at most 50000 videos.

### Step S10: Request Body Size Limit + Timeouts (Go)
**Severity:** High
**Description:** Fiber has no `BodyLimit` configured, allowing arbitrarily large POST payloads.
**Files:**
- `realtube-go/cmd/server/main.go` — add `BodyLimit: 1 * 1024 * 1024` (1MB), `ReadTimeout: 10 * time.Second`, `WriteTimeout: 30 * time.Second` to Fiber config
**Design docs:** `go-backend-design.md`
**Verification:** `docker compose up -d --build go-backend`. Send oversized payload: `dd if=/dev/zero bs=2M count=1 | curl -X POST -d @- http://localhost:8080/api/votes` returns 413.

### Step S11: Path Traversal Protection in Export Handlers
**Severity:** High
**Description:** Export handlers use `filepath.Join`/`Path.glob` without validating the resolved path stays within the export directory.
**Files:**
- `realtube-go/internal/handler/export.go` — validate filename with regex `^[a-zA-Z0-9_.-]+\.sql\.gz$`, validate resolved path starts with export dir
- `realtube-python/app/routers/export.py` — resolve latest file path, check `is_relative_to(export_path)`
**Design docs:** `security-design.md`
**Verification:** Both backends build. `GET /api/database/export` still returns the export file. A symlink or `..` in the export dir does not escape.

### Step S12: Remove DB/Redis Port Exposure
**Severity:** High
**Description:** PostgreSQL (5432) and Redis (6379) ports are published to the host. Remove for production safety.
**Files:**
- `docker-compose.yml` — remove `ports:` sections for `postgres` and `redis` services. Add comments noting they're accessible via Docker internal network only.
**Design docs:** `infrastructure-design.md`
**Verification:** `docker compose up -d`. `curl localhost:5432` and `curl localhost:6379` both fail (connection refused). Both backends still connect via internal network (`/health/ready` shows DB+Redis up).

### Step S13: NGINX — TLS/HTTPS + Security Headers
**Severity:** High
**Description:** NGINX only listens on port 80 with no TLS and no security headers. Add HTTPS listener with self-signed cert for dev, and add all standard security headers.
**Files:**
- `nginx/nginx.conf` — add `listen 443 ssl http2`, add `ssl_certificate`/`ssl_certificate_key` directives, add HTTP→HTTPS redirect, add headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security`
- `nginx/certs/` (new dir) — add a script or docker-compose volume for self-signed cert generation in dev
- `docker-compose.yml` — expose port 443, mount certs volume
**Design docs:** `infrastructure-design.md`, `security-design.md` section 13
**Verification:** `curl -k https://localhost/health/live` returns 200. Response headers include `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`. HTTP request to port 80 redirects to HTTPS.

### Step S14: Restrict CORS Origins in Docker Compose
**Severity:** High
**Description:** `CORS_ORIGINS=*` in docker-compose.yml allows any website to make API requests.
**Files:**
- `docker-compose.yml` — change `CORS_ORIGINS=*` to `CORS_ORIGINS=chrome-extension://*,http://localhost:*` for development
- `realtube-go/cmd/server/main.go` — add startup warning if `ENVIRONMENT=production` and `CORS_ORIGINS=*`
- `realtube-python/app/main.py` — add startup warning if `environment=production` and `cors_origins=*`
**Design docs:** `security-design.md` section 13
**Verification:** `curl -H "Origin: https://evil.com" -I http://localhost:8080/health/live` — no `Access-Control-Allow-Origin` for evil.com.

### Step S15: Extension — Replace innerHTML with Safe DOM APIs
**Severity:** High
**Description:** `vote-ui.ts` uses `innerHTML` to insert category names and server error messages, creating XSS risk if data becomes dynamic.
**Files:**
- `realtube-extension/src/content/vote-ui.ts` — replace `innerHTML` for category rows (lines ~73-78) with `createElement`/`textContent`. Replace error feedback `innerHTML` (line ~210) with `textContent` for the message span.
**Design docs:** `extension-design.md`
**Verification:** `cd realtube-extension && npm run build` compiles. Vote UI still renders categories and feedback messages correctly.

### Step S16: Python — Disable Debug Reload in Production
**Severity:** High
**Description:** `uvicorn.run(..., reload=True)` is hardcoded regardless of environment.
**Files:**
- `realtube-python/app/main.py` — change `reload=True` to `reload=(settings.environment == "development")`
**Design docs:** `python-backend-design.md`
**Verification:** With `ENVIRONMENT=production`, Python backend starts without reload watcher. With `ENVIRONMENT=development`, reload is enabled.

---

## Phase 3: Medium (Hardening Before v1.0)

### Step S17: Health Endpoint — Sanitize Error Messages
**Severity:** Medium
**Description:** Go `/health/ready` returns `err.Error()` which may reveal internal infrastructure details.
**Files:**
- `realtube-go/internal/handler/health.go` — replace `err.Error()` with generic `"connection failed"` in both DB and Redis check error paths
- `realtube-python/app/routers/health.py` — same: replace exception details with generic message
**Verification:** Stop Redis, hit `/health/ready` — response shows `"error": "connection failed"`, not internal error details.

### Step S18: Rate Limiter Memory Cleanup
**Severity:** Medium
**Description:** Python in-memory rate limiter uses unbounded dict with no cleanup of expired entries.
**Files:**
- `realtube-python/app/middleware/ratelimit.py` — add a periodic cleanup that removes expired entries when dict exceeds a threshold (e.g., 10000 keys). Add `_max_entries` config.
- `realtube-go/internal/middleware/ratelimit.go` — verify Go limiter already has cleanup (it does via periodic goroutine); no change needed if so
**Verification:** Python backend starts. After 10000+ unique IPs, memory stays bounded. Rate limiting still works correctly.

### Step S19: Container Security Constraints
**Severity:** Medium
**Description:** Add `security_opt`, `cap_drop`, and `read_only` where possible to all Docker services.
**Files:**
- `docker-compose.yml` — add `security_opt: [no-new-privileges:true]` and `cap_drop: [ALL]` to go-backend, python-backend, and db-exporter services
**Verification:** `docker compose up -d`. All services start and pass health checks.

### Step S20: Extension — Remove Excessive Host Permission
**Severity:** Medium
**Description:** Chrome manifest requests `*://youtube.com/*` (non-www) which is unnecessary since YouTube redirects to www.
**Files:**
- `realtube-extension/public/chrome/manifest.json` — remove `*://youtube.com/*` from `host_permissions`
**Verification:** `cd realtube-extension && npm run build`. Extension still detects and hides videos on `www.youtube.com`.

### Step S21: Extension — Update React to Patched Version
**Severity:** Medium
**Description:** React 19.0.0 has CVE-2025-55182 (RCE in Server Components). While the extension doesn't use RSC, update to patched version.
**Files:**
- `realtube-extension/package.json` — update `react` and `react-dom` to `^19.0.1`
- Run `npm install`
**Verification:** `cd realtube-extension && npm install && npm run build` — builds successfully, no vulnerabilities in `npm audit`.

### Step S22: Extension — Restrict User ID Exposure
**Severity:** Medium
**Description:** `GET_USER_ID` message handler returns the full hashed user ID to any caller including content scripts. Restrict to popup/options pages only.
**Files:**
- `realtube-extension/src/background/background.ts` — in `GET_USER_ID` handler, check that sender is from an extension page (not content script tab) before returning user ID
**Verification:** `cd realtube-extension && npm run build`. Popup still displays user ID. Content script cannot retrieve it.

### Step S23: Database Connection Encryption
**Severity:** Medium
**Description:** Backend-to-PostgreSQL connections use unencrypted `postgres://` protocol.
**Files:**
- `docker-compose.yml` — append `?sslmode=prefer` to both `DATABASE_URL` values (prefer SSL when available, fall back for dev)
- Document that production should use `sslmode=require` with proper certs
**Verification:** Both backends start and connect. `/health/ready` shows database "up".
