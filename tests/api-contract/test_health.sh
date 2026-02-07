#!/usr/bin/env bash
# API Contract Tests: Health Endpoints
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"
BASE_URL="${1:?Usage: $0 <base_url>}"

echo -e "\n${CYAN}── Health Endpoints ──${NC}"

# GET /health/live
echo "GET /health/live"
do_request GET "$BASE_URL/health/live"
assert_status "liveness returns 200" 200 "$RESP_STATUS"
assert_json_field "status is ok" "$RESP_BODY" "['status']" "ok"

# GET /health/ready
echo "GET /health/ready"
do_request GET "$BASE_URL/health/ready"
assert_status "readiness returns 200" 200 "$RESP_STATUS"
assert_json_exists "has status field" "$RESP_BODY" "d.get('status')"
assert_json_exists "has checks field" "$RESP_BODY" "d.get('checks')"

print_summary
