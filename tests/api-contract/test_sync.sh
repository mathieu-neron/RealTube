#!/usr/bin/env bash
# API Contract Tests: Sync Endpoints
# NOTE: Sync rate limit is 2/min per IP. We test the two valid requests first
# to verify response shape, then test error handling which may hit 429.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"
BASE_URL="${1:?Usage: $0 <base_url>}"

echo -e "\n${CYAN}── Sync Endpoints ──${NC}"

# === Valid requests first (consume our 2/min quota) ===

# GET /api/sync/delta — valid request (may return empty arrays)
echo "GET /api/sync/delta?since=2020-01-01T00:00:00Z"
do_request GET "$BASE_URL/api/sync/delta?since=2020-01-01T00:00:00Z"
assert_status "valid delta sync returns 200" 200 "$RESP_STATUS"
assert_json_exists "has videos array" "$RESP_BODY" "d.get('videos')"
assert_json_exists "has channels array" "$RESP_BODY" "d.get('channels')"
assert_json_exists "has syncTimestamp" "$RESP_BODY" "d.get('syncTimestamp')"
assert_json_type "videos is list" "$RESP_BODY" "['videos']" "list"
assert_json_type "channels is list" "$RESP_BODY" "['channels']" "list"

# GET /api/sync/full
echo "GET /api/sync/full"
do_request GET "$BASE_URL/api/sync/full"
assert_status "full sync returns 200" 200 "$RESP_STATUS"
assert_json_exists "has videos array" "$RESP_BODY" "d.get('videos')"
assert_json_exists "has channels array" "$RESP_BODY" "d.get('channels')"
assert_json_exists "has generatedAt" "$RESP_BODY" "d.get('generatedAt')"
assert_json_type "videos is list" "$RESP_BODY" "['videos']" "list"
assert_json_type "channels is list" "$RESP_BODY" "['channels']" "list"

# === Error handling (may be rate-limited, so we accept 400 OR 429) ===

# GET /api/sync/delta — missing since parameter
echo "GET /api/sync/delta — missing since"
do_request GET "$BASE_URL/api/sync/delta"
if [ "$RESP_STATUS" = "400" ]; then
  echo -e "  ${GREEN}✓${NC} missing since returns 400 (HTTP 400)"
  PASS=$((PASS + 1))
  # Also check error code
  assert_json_field "error code" "$RESP_BODY" "['error']['code']" "MISSING_PARAM"
elif [ "$RESP_STATUS" = "429" ]; then
  echo -e "  ${YELLOW}⊘${NC} missing since — skipped (rate limited)"
  SKIP=$((SKIP + 1))
else
  echo -e "  ${RED}✗${NC} missing since — expected 400 or 429, got $RESP_STATUS"
  FAIL=$((FAIL + 1))
fi

# GET /api/sync/delta — invalid timestamp
echo "GET /api/sync/delta?since=not-a-date"
do_request GET "$BASE_URL/api/sync/delta?since=not-a-date"
if [ "$RESP_STATUS" = "400" ]; then
  echo -e "  ${GREEN}✓${NC} invalid since returns 400 (HTTP 400)"
  PASS=$((PASS + 1))
  assert_json_field "error code" "$RESP_BODY" "['error']['code']" "INVALID_PARAM"
elif [ "$RESP_STATUS" = "429" ]; then
  echo -e "  ${YELLOW}⊘${NC} invalid since — skipped (rate limited)"
  SKIP=$((SKIP + 1))
else
  echo -e "  ${RED}✗${NC} invalid since — expected 400 or 429, got $RESP_STATUS"
  FAIL=$((FAIL + 1))
fi

print_summary
