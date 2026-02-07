#!/usr/bin/env bash
# API Contract Tests: Video Endpoints
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"
BASE_URL="${1:?Usage: $0 <base_url>}"

echo -e "\n${CYAN}── Video Endpoints ──${NC}"

# GET /api/videos/:hashPrefix — invalid prefix (too short)
echo "GET /api/videos/:hashPrefix — invalid prefix"
do_request GET "$BASE_URL/api/videos/ab"
assert_status "short prefix returns 400" 400 "$RESP_STATUS"
assert_json_field "error code" "$RESP_BODY" "['error']['code']" "INVALID_PREFIX"

# GET /api/videos/:hashPrefix — no matching videos (valid hex prefix, no data)
echo "GET /api/videos/:hashPrefix — no matches"
do_request GET "$BASE_URL/api/videos/ffffffff"
assert_status "no-match prefix returns 404" 404 "$RESP_STATUS"

# GET /api/videos?videoId= — missing param
echo "GET /api/videos — missing videoId"
do_request GET "$BASE_URL/api/videos"
assert_status "missing videoId returns 400" 400 "$RESP_STATUS"
assert_json_field "error code" "$RESP_BODY" "['error']['code']" "INVALID_FIELD"

# GET /api/videos?videoId=nonexistent — not found (valid format, 11 chars)
echo "GET /api/videos?videoId=nonexistent"
do_request GET "$BASE_URL/api/videos?videoId=zZzZzZzZzZz"
assert_status "nonexistent videoId returns 404" 404 "$RESP_STATUS"

print_summary
