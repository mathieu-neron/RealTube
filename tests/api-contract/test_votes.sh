#!/usr/bin/env bash
# API Contract Tests: Vote Endpoints
# Tests the full vote lifecycle: submit → verify → delete → verify gone
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"
BASE_URL="${1:?Usage: $0 <base_url>}"

# Use hex user IDs and short alphanumeric video IDs that pass validation
TS=$(date +%s)
# Truncate to fit VARCHAR(16): "v" + last 9 digits of epoch
TEST_VIDEO="v${TS: -9}"
# Hex user ID (last 10 hex digits of epoch as hex)
TEST_USER=$(printf '%010x' "$TS")

echo -e "\n${CYAN}── Vote Endpoints ──${NC}"

# POST /api/votes — missing fields
echo "POST /api/votes — missing fields"
do_request POST "$BASE_URL/api/votes" '{"videoId":"","userId":"","category":""}'
assert_status "empty body returns 400" 400 "$RESP_STATUS"

# POST /api/votes — invalid category
echo "POST /api/votes — invalid category"
do_request POST "$BASE_URL/api/votes" "{\"videoId\":\"$TEST_VIDEO\",\"userId\":\"$TEST_USER\",\"category\":\"invalid_cat\",\"userAgent\":\"test\"}"
assert_status "invalid category returns 400" 400 "$RESP_STATUS"
assert_json_field "error code" "$RESP_BODY" "['error']['code']" "INVALID_CATEGORY"

# POST /api/votes — valid submission
echo "POST /api/votes — valid submission"
do_request POST "$BASE_URL/api/votes" "{\"videoId\":\"$TEST_VIDEO\",\"userId\":\"$TEST_USER\",\"category\":\"fully_ai\",\"userAgent\":\"contract-test/1.0\"}"
assert_status "valid vote returns 200" 200 "$RESP_STATUS"
assert_json_field "success is true" "$RESP_BODY" "['success']" "True"
assert_json_exists "has newScore" "$RESP_BODY" "d.get('newScore')"
assert_json_exists "has userTrust" "$RESP_BODY" "d.get('userTrust')"

# POST /api/votes — duplicate (update)
echo "POST /api/votes — duplicate updates category"
do_request POST "$BASE_URL/api/votes" "{\"videoId\":\"$TEST_VIDEO\",\"userId\":\"$TEST_USER\",\"category\":\"ai_voiceover\",\"userAgent\":\"contract-test/1.0\"}"
assert_status "duplicate vote returns 200 (upsert)" 200 "$RESP_STATUS"
assert_json_field "success is true" "$RESP_BODY" "['success']" "True"

# GET /api/videos?videoId=X — verify vote created the video record
echo "GET /api/videos?videoId=$TEST_VIDEO — verify video exists after vote"
do_request GET "$BASE_URL/api/videos?videoId=$TEST_VIDEO"
assert_status "video exists after vote" 200 "$RESP_STATUS"
assert_json_field "videoId matches" "$RESP_BODY" "['videoId']" "$TEST_VIDEO"
assert_json_exists "has score" "$RESP_BODY" "d.get('score')"
assert_json_exists "has categories" "$RESP_BODY" "d.get('categories')"

# DELETE /api/votes — missing fields
echo "DELETE /api/votes — missing fields"
do_request DELETE "$BASE_URL/api/votes" '{"videoId":"","userId":""}'
assert_status "empty delete returns 400" 400 "$RESP_STATUS"

# DELETE /api/votes — valid deletion
echo "DELETE /api/votes — valid"
do_request DELETE "$BASE_URL/api/votes" "{\"videoId\":\"$TEST_VIDEO\",\"userId\":\"$TEST_USER\"}"
assert_status "valid delete returns 200" 200 "$RESP_STATUS"
assert_json_field "success is true" "$RESP_BODY" "['success']" "True"

# DELETE /api/votes — already deleted (not found)
echo "DELETE /api/votes — already deleted"
do_request DELETE "$BASE_URL/api/votes" "{\"videoId\":\"$TEST_VIDEO\",\"userId\":\"$TEST_USER\"}"
assert_status "re-delete returns 404" 404 "$RESP_STATUS"

print_summary
