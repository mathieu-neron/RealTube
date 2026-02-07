#!/usr/bin/env bash
# Shared test helpers for API contract tests

PASS=0
FAIL=0
SKIP=0
ERRORS=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Globals set by do_request
RESP_STATUS=""
RESP_HEADERS=""
RESP_BODY=""

assert_status() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo -e "  ${GREEN}✓${NC} $label (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $label — expected HTTP $expected, got HTTP $actual"
    FAIL=$((FAIL + 1))
    ERRORS="${ERRORS}\n  - $label: expected $expected, got $actual"
  fi
}

assert_json_field() {
  local label="$1"
  local body="$2"
  local field="$3"
  local expected="$4"
  local actual
  actual=$(echo "$body" | python -c "import sys,json; d=json.load(sys.stdin); print(d${field})" 2>/dev/null)
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} $label ($field = $expected)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $label — $field expected '$expected', got '$actual'"
    FAIL=$((FAIL + 1))
    ERRORS="${ERRORS}\n  - $label: $field expected '$expected', got '$actual'"
  fi
}

assert_json_exists() {
  local label="$1"
  local body="$2"
  local field="$3"
  local actual
  actual=$(echo "$body" | python -c "import sys,json; d=json.load(sys.stdin); print('exists' if ${field} is not None else 'missing')" 2>/dev/null)
  if [ "$actual" = "exists" ]; then
    echo -e "  ${GREEN}✓${NC} $label ($field exists)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $label — $field missing from response"
    FAIL=$((FAIL + 1))
    ERRORS="${ERRORS}\n  - $label: $field missing"
  fi
}

assert_json_type() {
  local label="$1"
  local body="$2"
  local field="$3"
  local expected_type="$4"
  local actual
  actual=$(echo "$body" | python -c "import sys,json; d=json.load(sys.stdin); print(type(d${field}).__name__)" 2>/dev/null)
  if [ "$actual" = "$expected_type" ]; then
    echo -e "  ${GREEN}✓${NC} $label ($field is $expected_type)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $label — $field expected type '$expected_type', got '$actual'"
    FAIL=$((FAIL + 1))
    ERRORS="${ERRORS}\n  - $label: $field expected type '$expected_type', got '$actual'"
  fi
}

assert_header_exists() {
  local label="$1"
  local headers="$2"
  local header_name="$3"
  if echo "$headers" | grep -qi "^${header_name}:"; then
    echo -e "  ${GREEN}✓${NC} $label ($header_name present)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $label — header '$header_name' missing"
    FAIL=$((FAIL + 1))
    ERRORS="${ERRORS}\n  - $label: header '$header_name' missing"
  fi
}

print_summary() {
  echo ""
  echo -e "${CYAN}══════════════════════════════════════${NC}"
  echo -e "  ${GREEN}Passed:${NC} $PASS"
  echo -e "  ${RED}Failed:${NC} $FAIL"
  echo -e "  ${YELLOW}Skipped:${NC} $SKIP"
  echo -e "${CYAN}══════════════════════════════════════${NC}"
  if [ $FAIL -gt 0 ]; then
    echo -e "\n${RED}Failures:${NC}$ERRORS"
    return 1
  fi
  return 0
}

# Perform an HTTP request and set RESP_STATUS, RESP_HEADERS, RESP_BODY globals.
# Usage: do_request METHOD URL [JSON_DATA]
do_request() {
  local method="$1"
  local url="$2"
  local data="${3:-}"
  local header_file body_file
  header_file=$(mktemp)
  body_file=$(mktemp)

  local args=(-s -o "$body_file" -w "%{http_code}" -D "$header_file")
  if [ -n "$data" ]; then
    args+=(-X "$method" -H "Content-Type: application/json" -d "$data")
  else
    args+=(-X "$method")
  fi

  RESP_STATUS=$(curl "${args[@]}" "$url")
  RESP_HEADERS=$(cat "$header_file")
  RESP_BODY=$(cat "$body_file")
  rm -f "$header_file" "$body_file"
}
