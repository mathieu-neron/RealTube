#!/usr/bin/env bash
# API Contract Tests: Rate Limiting
# Verifies that rate limit headers are present and 429 is returned when exceeded
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"
BASE_URL="${1:?Usage: $0 <base_url>}"

echo -e "\n${CYAN}── Rate Limit Headers ──${NC}"

# Check that rate limit headers exist on a normal request
echo "GET /api/stats — check rate limit headers"
do_request GET "$BASE_URL/api/stats"
assert_status "stats returns 200" 200 "$RESP_STATUS"
assert_header_exists "X-RateLimit-Limit present" "$RESP_HEADERS" "X-RateLimit-Limit"
assert_header_exists "X-RateLimit-Remaining present" "$RESP_HEADERS" "X-RateLimit-Remaining"
assert_header_exists "X-RateLimit-Reset present" "$RESP_HEADERS" "X-RateLimit-Reset"

echo -e "\n${CYAN}── Rate Limit Enforcement (Vote Submit) ──${NC}"

# Rapid-fire 12 vote submissions to trigger 429 (limit is 10/min)
# Use hex userId and short alphanumeric videoId that pass validation
TEST_USER=$(printf '%012x' "$(date +%s)")
hit_429=false
echo "Sending 12 rapid vote submissions..."
for i in $(seq 1 12); do
  do_request POST "$BASE_URL/api/votes" "{\"videoId\":\"rl${i}test\",\"userId\":\"$TEST_USER\",\"category\":\"fully_ai\",\"userAgent\":\"rate-test\"}"
  if [ "$RESP_STATUS" = "429" ]; then
    echo -e "  ${GREEN}✓${NC} Got 429 on request #$i"
    PASS=$((PASS + 1))
    hit_429=true
    break
  fi
done

if [ "$hit_429" = false ]; then
  echo -e "  ${RED}✗${NC} Did not get 429 after 12 rapid requests"
  FAIL=$((FAIL + 1))
  ERRORS="${ERRORS}\n  - Rate limit not enforced on POST /api/votes after 12 requests"
fi

# Cleanup test votes (best-effort, may fail due to rate limit)
for i in $(seq 1 12); do
  do_request DELETE "$BASE_URL/api/votes" "{\"videoId\":\"rl${i}test\",\"userId\":\"$TEST_USER\"}" || true
done

print_summary
