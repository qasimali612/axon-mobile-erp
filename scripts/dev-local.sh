#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SEED_ADMIN_PASSWORD:-}" || ${#SEED_ADMIN_PASSWORD} -lt 12 ]]; then
  echo "SEED_ADMIN_PASSWORD (minimum 12 characters) must be supplied in the environment." >&2
  exit 1
fi

export DEMO_SEED=true
export DEMO_ADMIN_EMAIL="${DEMO_ADMIN_EMAIL:-owner@axonmobile.local}"
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54329/postgres?sslmode=disable&connection_limit=1&pgbouncer=true"
mkdir -p .pglite

exec pglite-server \
  --db=./.pglite/axon-erp \
  --port=54329 \
  --host=127.0.0.1 \
  --max-connections=20 \
  --run "npm run db:prepare && npm run dev"
