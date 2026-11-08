#!/usr/bin/env bash
# Cold-start preparation for the preview sandbox.
#
# Snapshots exclude node_modules and .next, and background processes do not survive a turn
# boundary, so a fresh sandbox has neither dependencies nor a build. This script restores both
# in the one order that works on a memory-bounded box:
#
#   deps -> prisma client -> build (with NO database running) -> caller starts db -> caller starts app
#
# `next build` must run while PGlite is stopped: the two together exceed the container memory
# limit and the build worker is killed with SIGKILL, which looks like a hung build.
#
# Usage: bash scripts/prepare-preview.sh [--force-rebuild]
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "✗ .env is missing. Copy .env.example to .env and set DATABASE_URL / SEED_ADMIN_PASSWORD." >&2
  exit 1
fi

if [ -z "${SKIP_DB_CHECK:-}" ] && (ss -ltn 2>/dev/null | grep -q ':54329 '); then
  echo "✗ The database is listening on :54329. Stop it before building (memory limit)." >&2
  exit 1
fi

if [ ! -d node_modules ] || [ ! -x node_modules/.bin/next ]; then
  echo "· Installing dependencies from the lockfile"
  npm ci --no-audit --no-fund
else
  echo "✓ Dependencies present"
fi

echo "· Generating the Prisma client"
npx prisma generate >/dev/null

if [ ! -f .next/BUILD_ID ] || [ "${1:-}" = "--force-rebuild" ]; then
  echo "· Building the production bundle"
  rm -rf .next
  NODE_OPTIONS="--max-old-space-size=1200" npx next build
else
  echo "✓ Existing build found (.next/BUILD_ID)"
fi

echo "✓ Preview ready. Start the database (bash scripts/db-start.sh), then the app (npm run start)."
