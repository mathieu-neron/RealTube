#!/usr/bin/env bash
# RealTube API Contract Test Runner
# Usage: ./run_tests.sh <base_url>
# Example: ./run_tests.sh http://localhost:8080   (Go backend)
#          ./run_tests.sh http://localhost:8081   (Python backend)
set -uo pipefail

BASE_URL="${1:?Usage: $0 <base_url>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║   RealTube API Contract Tests        ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════╝${NC}"
echo -e "Target: ${BOLD}$BASE_URL${NC}"
echo ""

# Check prerequisites
if ! command -v curl &>/dev/null; then
  echo -e "${RED}Error: curl is required${NC}"
  exit 1
fi
if ! command -v python &>/dev/null; then
  echo -e "${RED}Error: python is required for JSON assertions${NC}"
  exit 1
fi

# Check that server is reachable
echo -n "Checking server connectivity... "
if curl -sf "$BASE_URL/health/live" >/dev/null 2>&1; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FAILED${NC}"
  echo "Server at $BASE_URL is not reachable. Is it running?"
  exit 1
fi

TOTAL_PASS=0
TOTAL_FAIL=0
SUITE_FAILS=""

run_suite() {
  local suite="$1"
  local name="$2"
  local output
  output=$(bash "$SCRIPT_DIR/$suite" "$BASE_URL" 2>&1) || true
  local exit_code=$?
  echo "$output"

  # Parse pass/fail from output (strip ANSI codes first, then extract numbers)
  local p f stripped
  stripped=$(echo "$output" | sed 's/\x1b\[[0-9;]*m//g')
  p=$(echo "$stripped" | grep "Passed:" | sed 's/.*Passed:[^0-9]*//' | sed 's/[^0-9].*//' || echo 0)
  f=$(echo "$stripped" | grep "Failed:" | sed 's/.*Failed:[^0-9]*//' | sed 's/[^0-9].*//' || echo 0)
  [ -z "$p" ] && p=0
  [ -z "$f" ] && f=0
  TOTAL_PASS=$((TOTAL_PASS + p))
  TOTAL_FAIL=$((TOTAL_FAIL + f))
  if [ "$f" -gt 0 ] || [ "$exit_code" -ne 0 ]; then
    SUITE_FAILS="${SUITE_FAILS}\n  - $name"
  fi
}

run_suite test_health.sh "Health"
run_suite test_videos.sh "Videos"
run_suite test_votes.sh "Votes"
run_suite test_channels.sh "Channels/Users/Stats"
run_suite test_sync.sh "Sync"
run_suite test_ratelimits.sh "Rate Limits"

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║   OVERALL RESULTS                    ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════╝${NC}"
echo -e "  ${GREEN}Total Passed:${NC} $TOTAL_PASS"
echo -e "  ${RED}Total Failed:${NC} $TOTAL_FAIL"

if [ $TOTAL_FAIL -gt 0 ]; then
  echo -e "\n${RED}Failed suites:${NC}$SUITE_FAILS"
  exit 1
else
  echo -e "\n${GREEN}${BOLD}All tests passed!${NC}"
  exit 0
fi
