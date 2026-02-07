#!/usr/bin/env bash
# API Contract Tests: Channel & User & Stats Endpoints
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"
BASE_URL="${1:?Usage: $0 <base_url>}"

echo -e "\n${CYAN}── Channel Endpoints ──${NC}"

# GET /api/channels/:channelId — not found (valid format)
echo "GET /api/channels/nonexistent"
do_request GET "$BASE_URL/api/channels/UCnonexistent12345"
assert_status "nonexistent channel returns 404" 404 "$RESP_STATUS"

echo -e "\n${CYAN}── User Endpoints ──${NC}"

# GET /api/users/:userId — unknown user auto-created with defaults
echo "GET /api/users/new-user"
do_request GET "$BASE_URL/api/users/deadbeef12345678"
assert_status "unknown user auto-created returns 200" 200 "$RESP_STATUS"
assert_json_field "auto-created userId matches" "$RESP_BODY" "['userId']" "deadbeef12345678"
assert_json_exists "has default trustScore" "$RESP_BODY" "d.get('trustScore')"

# Create a user by submitting a vote, then check their profile
TS=$(date +%s)
TEST_USER=$(printf '%012x' "$TS")
TEST_VIDEO="vc${TS: -9}"

echo "POST /api/votes — create test user"
do_request POST "$BASE_URL/api/votes" "{\"videoId\":\"$TEST_VIDEO\",\"userId\":\"$TEST_USER\",\"category\":\"ai_visuals\",\"userAgent\":\"contract-test/1.0\"}"
assert_status "create test user via vote" 200 "$RESP_STATUS"

# GET /api/users/:userId — existing user
echo "GET /api/users/$TEST_USER"
do_request GET "$BASE_URL/api/users/$TEST_USER"
assert_status "existing user returns 200" 200 "$RESP_STATUS"
assert_json_field "userId matches" "$RESP_BODY" "['userId']" "$TEST_USER"
assert_json_exists "has trustScore" "$RESP_BODY" "d.get('trustScore')"
assert_json_exists "has totalVotes" "$RESP_BODY" "d.get('totalVotes')"
assert_json_exists "has accuracyRate" "$RESP_BODY" "d.get('accuracyRate')"
assert_json_exists "has accountAge" "$RESP_BODY" "d.get('accountAge')"

echo -e "\n${CYAN}── Stats Endpoint ──${NC}"

# GET /api/stats
echo "GET /api/stats"
do_request GET "$BASE_URL/api/stats"
assert_status "stats returns 200" 200 "$RESP_STATUS"
assert_json_exists "has totalVideos" "$RESP_BODY" "d.get('totalVideos')"
assert_json_exists "has totalVotes" "$RESP_BODY" "d.get('totalVotes')"
assert_json_exists "has totalUsers" "$RESP_BODY" "d.get('totalUsers')"
assert_json_exists "has topCategories" "$RESP_BODY" "d.get('topCategories')"

# Cleanup: delete the test vote
do_request DELETE "$BASE_URL/api/votes" "{\"videoId\":\"$TEST_VIDEO\",\"userId\":\"$TEST_USER\"}" || true

print_summary
