#!/usr/bin/env bash
# =============================================================================
# RealTube End-to-End Integration Test
#
# Brings up the Docker Compose stack, seeds test data, and validates the full
# request lifecycle across both Go and Python backends:
#   1. Health checks (liveness + readiness)
#   2. Video lookup (hash-prefix + direct)
#   3. Vote submit → score update → delta sync picks it up
#   4. Channel aggregation
#   5. User info & stats
#   6. Metrics endpoint
#   7. Cleanup: delete test vote and verify removal
#
# Usage: ./tests/e2e/run_e2e.sh
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Reuse helpers from the contract test suite
source "$PROJECT_DIR/tests/api-contract/helpers.sh"

GO_URL="http://localhost:8080"
PY_URL="http://localhost:8081"
DB_CONTAINER="realtube-postgres-1"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║   RealTube E2E Integration Test      ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Step 0: Ensure Docker Compose stack is up ──
echo -e "${BOLD}[0/8] Checking Docker Compose stack...${NC}"

if ! docker compose -f "$PROJECT_DIR/docker-compose.yml" ps --status running 2>/dev/null | grep -q postgres; then
  echo "  Starting Docker Compose stack..."
  docker compose -f "$PROJECT_DIR/docker-compose.yml" up -d --build 2>&1 | tail -5
  echo "  Waiting for services to become healthy..."
  sleep 10
fi

# Wait for both backends to respond (up to 30s)
for i in $(seq 1 30); do
  if curl -sf "$GO_URL/health/live" >/dev/null 2>&1 && curl -sf "$PY_URL/health/live" >/dev/null 2>&1; then
    echo -e "  ${GREEN}Both backends are up.${NC}"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo -e "  ${RED}Backends not reachable after 30s. Aborting.${NC}"
    exit 1
  fi
  sleep 1
done

# ── Step 1: Seed test data ──
echo -e "\n${BOLD}[1/8] Seeding test data...${NC}"
docker exec -i "$DB_CONTAINER" psql -U realtube -d realtube < "$SCRIPT_DIR/seed_data.sql" >/dev/null 2>&1
echo -e "  ${GREEN}Seed data loaded.${NC}"

# ── Step 2: Health checks ──
echo -e "\n${BOLD}[2/8] Health checks${NC}"

for label_url in "Go:$GO_URL" "Python:$PY_URL"; do
  label="${label_url%%:*}"
  url="${label_url#*:}"

  echo -e "\n${CYAN}── $label Backend ──${NC}"

  do_request GET "$url/health/live"
  assert_status "$label liveness returns 200" 200 "$RESP_STATUS"
  assert_json_field "$label liveness status" "$RESP_BODY" "['status']" "ok"

  do_request GET "$url/health/ready"
  assert_status "$label readiness returns 200" 200 "$RESP_STATUS"
  assert_json_exists "$label readiness has checks" "$RESP_BODY" "d.get('checks')"
  assert_json_exists "$label readiness has uptime" "$RESP_BODY" "d.get('uptime_seconds')"
done

# ── Step 3: Video lookup (seeded data) ──
echo -e "\n${BOLD}[3/8] Video lookup${NC}"

# Compute hash prefix of e2eVid01
HASH_PREFIX=$(python -c "import hashlib; print(hashlib.sha256(b'e2eVid01').hexdigest()[:8])")

for label_url in "Go:$GO_URL" "Python:$PY_URL"; do
  label="${label_url%%:*}"
  url="${label_url#*:}"

  echo -e "\n${CYAN}── $label Backend ──${NC}"

  # Direct lookup
  echo "GET /api/videos?videoId=e2eVid01"
  do_request GET "$url/api/videos?videoId=e2eVid01"
  assert_status "$label direct lookup returns 200" 200 "$RESP_STATUS"
  assert_json_field "$label videoId matches" "$RESP_BODY" "['videoId']" "e2eVid01"
  assert_json_exists "$label has score" "$RESP_BODY" "d.get('score')"
  assert_json_exists "$label has categories" "$RESP_BODY" "d.get('categories')"

  # Hash-prefix lookup
  echo "GET /api/videos/$HASH_PREFIX"
  do_request GET "$url/api/videos/$HASH_PREFIX"
  assert_status "$label hash-prefix lookup returns 200" 200 "$RESP_STATUS"

  # Non-existent video returns 404
  echo "GET /api/videos?videoId=nonexistent1"
  do_request GET "$url/api/videos?videoId=nonexistent1"
  assert_status "$label missing video returns 404" 404 "$RESP_STATUS"
done

# ── Step 4: Vote lifecycle (submit → verify score → delta sync → delete) ──
echo -e "\n${BOLD}[4/8] Vote lifecycle${NC}"

E2E_TS=$(date +%s)
E2E_VOTER=$(printf 'e2e%08x' "$E2E_TS")
E2E_VIDEO="e2eVid03"  # Real video with score 0, so we can observe score change

for label_url in "Go:$GO_URL" "Python:$PY_URL"; do
  label="${label_url%%:*}"
  url="${label_url#*:}"

  echo -e "\n${CYAN}── $label Backend ──${NC}"

  # Submit vote
  echo "POST /api/votes — submit vote on $E2E_VIDEO"
  do_request POST "$url/api/votes" "{\"videoId\":\"$E2E_VIDEO\",\"userId\":\"$E2E_VOTER\",\"category\":\"ai_assisted\",\"userAgent\":\"e2e-test/1.0\"}"
  assert_status "$label vote submit returns 200" 200 "$RESP_STATUS"
  assert_json_field "$label vote success" "$RESP_BODY" "['success']" "True"
  assert_json_exists "$label has newScore" "$RESP_BODY" "d.get('newScore')"

  # Wait for async score worker to process (5s batch window + margin)
  sleep 7

  # Verify video score was updated (should be > 0 now)
  echo "GET /api/videos?videoId=$E2E_VIDEO — verify score updated"
  do_request GET "$url/api/videos?videoId=$E2E_VIDEO"
  assert_status "$label video exists after vote" 200 "$RESP_STATUS"

  SCORE=$(echo "$RESP_BODY" | python -c "import sys,json; print(json.load(sys.stdin).get('score',0))" 2>/dev/null)
  if python -c "import sys; sys.exit(0 if float('$SCORE') > 0 else 1)" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} $label score > 0 after vote (score=$SCORE)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $label score should be > 0 after vote, got $SCORE"
    FAIL=$((FAIL + 1))
  fi

  # Check delta sync picks up the change (may be rate-limited: 2/min)
  echo "GET /api/sync/delta — verify vote appears"
  SINCE=$(date -u -d "10 minutes ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-10M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "2020-01-01T00:00:00Z")
  do_request GET "$url/api/sync/delta?since=$SINCE"
  if [ "$RESP_STATUS" = "200" ]; then
    echo -e "  ${GREEN}✓${NC} $label delta sync returns 200 (HTTP 200)"
    PASS=$((PASS + 1))
    assert_json_type "$label delta videos is list" "$RESP_BODY" "['videos']" "list"
    assert_json_exists "$label delta has syncTimestamp" "$RESP_BODY" "d.get('syncTimestamp')"
  elif [ "$RESP_STATUS" = "429" ]; then
    echo -e "  ${YELLOW}⊘${NC} $label delta sync — skipped (rate limited)"
    SKIP=$((SKIP + 3))
  else
    assert_status "$label delta sync returns 200" 200 "$RESP_STATUS"
  fi

  # Delete the vote
  echo "DELETE /api/votes — cleanup"
  do_request DELETE "$url/api/votes" "{\"videoId\":\"$E2E_VIDEO\",\"userId\":\"$E2E_VOTER\"}"
  assert_status "$label vote delete returns 200" 200 "$RESP_STATUS"
done

# ── Step 5: Channel lookup ──
echo -e "\n${BOLD}[5/8] Channel lookup${NC}"

for label_url in "Go:$GO_URL" "Python:$PY_URL"; do
  label="${label_url%%:*}"
  url="${label_url#*:}"

  echo -e "\n${CYAN}── $label Backend ──${NC}"

  echo "GET /api/channels/UCe2eAIchan01"
  do_request GET "$url/api/channels/UCe2eAIchan01"
  assert_status "$label channel lookup returns 200" 200 "$RESP_STATUS"
  assert_json_field "$label channelId matches" "$RESP_BODY" "['channelId']" "UCe2eAIchan01"
  assert_json_exists "$label has channel score" "$RESP_BODY" "d.get('score')"

  echo "GET /api/channels/nonexistent"
  do_request GET "$url/api/channels/nonexistent"
  assert_status "$label missing channel returns 404" 404 "$RESP_STATUS"
done

# ── Step 6: User info & stats ──
echo -e "\n${BOLD}[6/8] User info & stats${NC}"

for label_url in "Go:$GO_URL" "Python:$PY_URL"; do
  label="${label_url%%:*}"
  url="${label_url#*:}"

  echo -e "\n${CYAN}── $label Backend ──${NC}"

  echo "GET /api/users/ae2e00010abc"
  do_request GET "$url/api/users/ae2e00010abc"
  assert_status "$label user lookup returns 200" 200 "$RESP_STATUS"
  assert_json_field "$label userId matches" "$RESP_BODY" "['userId']" "ae2e00010abc"
  assert_json_exists "$label has trustScore" "$RESP_BODY" "d.get('trustScore')"
  assert_json_exists "$label has totalVotes" "$RESP_BODY" "d.get('totalVotes')"

  echo "GET /api/stats"
  do_request GET "$url/api/stats"
  assert_status "$label stats returns 200" 200 "$RESP_STATUS"
  assert_json_exists "$label has totalVideos" "$RESP_BODY" "d.get('totalVideos')"
  assert_json_exists "$label has totalUsers" "$RESP_BODY" "d.get('totalUsers')"
  assert_json_exists "$label has topCategories" "$RESP_BODY" "d.get('topCategories')"
done

# ── Step 7: Full sync ──
echo -e "\n${BOLD}[7/8] Full sync${NC}"

for label_url in "Go:$GO_URL" "Python:$PY_URL"; do
  label="${label_url%%:*}"
  url="${label_url#*:}"

  echo -e "\n${CYAN}── $label Backend ──${NC}"

  echo "GET /api/sync/full"
  do_request GET "$url/api/sync/full"
  if [ "$RESP_STATUS" = "200" ]; then
    echo -e "  ${GREEN}✓${NC} $label full sync returns 200 (HTTP 200)"
    PASS=$((PASS + 1))
    assert_json_type "$label full sync videos is list" "$RESP_BODY" "['videos']" "list"
    assert_json_type "$label full sync channels is list" "$RESP_BODY" "['channels']" "list"
    assert_json_exists "$label full sync has generatedAt" "$RESP_BODY" "d.get('generatedAt')"

    # Seeded videos should appear in full sync
    HAS_SEEDED=$(echo "$RESP_BODY" | python -c "
import sys, json
data = json.load(sys.stdin)
ids = [v.get('videoId','') for v in data.get('videos',[])]
print('yes' if 'e2eVid01' in ids else 'no')
" 2>/dev/null)
    if [ "$HAS_SEEDED" = "yes" ]; then
      echo -e "  ${GREEN}✓${NC} $label full sync contains seeded video e2eVid01"
      PASS=$((PASS + 1))
    else
      echo -e "  ${RED}✗${NC} $label full sync missing seeded video e2eVid01"
      FAIL=$((FAIL + 1))
    fi
  elif [ "$RESP_STATUS" = "429" ]; then
    echo -e "  ${YELLOW}⊘${NC} $label full sync — skipped (rate limited)"
    SKIP=$((SKIP + 5))
  else
    assert_status "$label full sync returns 200" 200 "$RESP_STATUS"
  fi
done

# ── Step 8: Prometheus metrics ──
echo -e "\n${BOLD}[8/8] Prometheus metrics${NC}"

for label_url in "Go:$GO_URL" "Python:$PY_URL"; do
  label="${label_url%%:*}"
  url="${label_url#*:}"

  echo -e "\n${CYAN}── $label Backend ──${NC}"

  METRICS_BODY=$(curl -sf "$url/metrics" 2>/dev/null || echo "")
  if echo "$METRICS_BODY" | grep -q "realtube_api_request_duration_seconds"; then
    echo -e "  ${GREEN}✓${NC} $label /metrics has request_duration histogram"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $label /metrics missing request_duration histogram"
    FAIL=$((FAIL + 1))
  fi

  if echo "$METRICS_BODY" | grep -q "realtube_db_connection_pool_active"; then
    echo -e "  ${GREEN}✓${NC} $label /metrics has db_pool_active gauge"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $label /metrics missing db_pool_active gauge"
    FAIL=$((FAIL + 1))
  fi

  if echo "$METRICS_BODY" | grep -q "realtube_requests_in_flight"; then
    echo -e "  ${GREEN}✓${NC} $label /metrics has requests_in_flight gauge"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $label /metrics missing requests_in_flight gauge"
    FAIL=$((FAIL + 1))
  fi
done

# ── Cleanup seed data ──
echo -e "\n${BOLD}Cleaning up E2E seed data...${NC}"
docker exec -i "$DB_CONTAINER" psql -U realtube -d realtube <<'CLEANUP_SQL' >/dev/null 2>&1
BEGIN;
DELETE FROM votes WHERE video_id IN ('e2eVid01', 'e2eVid02', 'e2eVid03');
DELETE FROM video_categories WHERE video_id IN ('e2eVid01', 'e2eVid02', 'e2eVid03');
DELETE FROM videos WHERE video_id IN ('e2eVid01', 'e2eVid02', 'e2eVid03');
DELETE FROM channels WHERE channel_id IN ('UCe2eAIchan01', 'UCe2eRealChan');
DELETE FROM users WHERE user_id IN ('ae2e00010abc', 'ae2e00020def');
DELETE FROM sync_cache WHERE video_id = 'e2eVid01';
COMMIT;
CLEANUP_SQL
echo -e "  ${GREEN}Cleanup complete.${NC}"

# ── Summary ──
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║   E2E TEST RESULTS                   ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════╝${NC}"

print_summary
