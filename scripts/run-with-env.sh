#!/usr/bin/env bash
# Runs a command with the project's .env exported.
#
# Next.js loads .env on its own, but standalone tsx scripts (acceptance suites, smoke test,
# maintenance jobs) talk to PostgreSQL through Prisma Client, which only reads process.env.
# Sourcing the file here keeps one source of truth for local and CI command invocations.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
exec "$@"
