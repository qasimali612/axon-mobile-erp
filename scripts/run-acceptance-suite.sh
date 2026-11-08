#!/usr/bin/env bash
# Runs every acceptance suite in dependency order against a running application and database.
#
# Prerequisites: database on 127.0.0.1:54329 (scripts/db-start.sh) and the app on port 3000.
# Usage: bash scripts/run-acceptance-suite.sh [--fast]
#   --fast  skip the three legacy control suites that only touch the database
set -uo pipefail

cd "$(dirname "$0")/.."
BASE_URL="${OPERATIONS_TEST_BASE_URL:-http://127.0.0.1:3000}"
FAST=""
[[ "${1:-}" == "--fast" ]] && FAST="1"

if ! ss -ltn 2>/dev/null | grep -q ':3000 '; then
  echo "The application is not listening on :3000. Start it before running the acceptance chain." >&2
  exit 1
fi

# Suites that sign in over HTTP with a real password. They are skipped, not failed, when the
# password is not supplied; pass DEMO_PASSWORD or the individual variables to include them.
export FINANCE_TEST_PASSWORD="${FINANCE_TEST_PASSWORD:-${DEMO_PASSWORD:-}}"
export OPERATIONS_TEST_PASSWORD="${OPERATIONS_TEST_PASSWORD:-${DEMO_PASSWORD:-}}"

SUITES=(
  "db-controls:test:db-controls"
  "finance-controls:test:finance-controls"
  "login-session:test:login-session-acceptance"
  "master-data:test:master-data-acceptance"
  "procurement-sales:test:procurement-sales-acceptance"
  "inventory-controls:test:inventory-controls-acceptance"
  "party-subledger:test:party-subledger-acceptance"
  "pricing-payment:test:pricing-payment-acceptance"
  "banking:test:banking-acceptance"
  "fixed-assets:test:fixed-assets-acceptance"
  "budgets:test:budgets-acceptance"
  "incentives:test:incentives-acceptance"
  "rebates:test:rebates-acceptance"
  "journal-workflow:test:journal-workflow"
  "operational-workflow:test:operational-workflow"
  "operational-controls:test:operational-controls"
  "operational-reconciliation:test:operational-reconciliation"
  "operational-reversals:test:operational-reversals"
  "reporting:test:reporting-acceptance"
  "enhancements:test:enhancements-acceptance"
)

[[ -n "$FAST" ]] && SUITES=("${SUITES[@]:2}")

LOG_DIR="${LOG_DIR:-/tmp/axon-acceptance}"
mkdir -p "$LOG_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
SUMMARY="$LOG_DIR/summary-$STAMP.txt"
: > "$SUMMARY"

pass=0
fail=0
skipped=0
failed_names=()

echo "Acceptance chain · $STAMP · target $BASE_URL"
for entry in "${SUITES[@]}"; do
  name="${entry%%:*}"
  script="${entry#*:}"
  printf '· %-26s ' "$name"
  if [[ "$name" == "journal-workflow" && -z "${FINANCE_TEST_PASSWORD:-}" ]] || [[ "$name" == "operational-workflow" || "$name" == "operational-controls" ]] && [[ -z "${OPERATIONS_TEST_PASSWORD:-}" ]]; then
    echo "SKIP  (password not supplied)"
    printf 'SKIP  %s
' "$name" >> "$SUMMARY"
    skipped=$((skipped + 1))
    continue
  fi
  if OPERATIONS_TEST_BASE_URL="$BASE_URL" npm run --silent "$script" > "$LOG_DIR/$name-$STAMP.log" 2>&1; then
    echo "PASS"
    printf 'PASS  %s\n' "$name" >> "$SUMMARY"
    pass=$((pass + 1))
  else
    echo "FAIL  ($LOG_DIR/$name-$STAMP.log)"
    printf 'FAIL  %s\n' "$name" >> "$SUMMARY"
    fail=$((fail + 1))
    failed_names+=("$name")
  fi
done

echo
echo "Result: $pass passed, $fail failed, $skipped skipped · log dir $LOG_DIR · summary $SUMMARY"
if (( fail > 0 )); then
  echo "Failed suites: ${failed_names[*]}" >&2
  exit 1
fi
echo "Every acceptance suite passed."
