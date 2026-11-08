#!/usr/bin/env bash
# Backup, restore and verify rehearsal for the Axon ERP database.
#
# Usage:
#   bash scripts/backup-restore-rehearsal.sh            # backup + restore into a scratch dir + verify
#   bash scripts/backup-restore-rehearsal.sh --keep     # keep the scratch restore for inspection
#
# The script stops the application, takes a consistent logical copy of the PGlite data
# directory, restores it into a temporary location, boots a second PGlite server on a spare
# port and compares critical row counts and migration state against the source.
set -euo pipefail

cd "$(dirname "$0")/.."
# Standalone tsx scripts read process.env only, so load the project environment once here.
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi
DB_DIR="${DB_DIR:-./.pglite/axon-erp}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
ARCHIVE="$BACKUP_DIR/axon-erp-$STAMP.tar.gz"
RESTORE_DIR="$(mktemp -d /tmp/axon-restore-XXXXXX)"
RESTORE_PORT="${RESTORE_PORT:-54331}"
KEEP=""
[[ "${1:-}" == "--keep" ]] && KEEP="1"

if [[ ! -d "$DB_DIR" ]]; then
  echo "Database directory $DB_DIR does not exist. Start the database first." >&2
  exit 1
fi

if ss -ltn 2>/dev/null | grep -q ':3000 '; then
  echo "Stop the application server before taking the backup so no write is in flight." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# Flush dirty shared buffers first, otherwise the copied directory is only crash-consistent and the
# restore has to replay WAL from the last checkpoint.
echo "· Forcing a checkpoint so the copy is clean"
npx tsx scripts/db-checkpoint.ts

echo "· Backing up $DB_DIR"
tar --exclude='*.pid' -czf "$ARCHIVE" -C "$DB_DIR" .
SIZE=$(du -h "$ARCHIVE" | cut -f1)
echo "✓ Backup written to $ARCHIVE ($SIZE)"

echo "· Restoring into $RESTORE_DIR"
mkdir -p "$RESTORE_DIR"
tar -xzf "$ARCHIVE" -C "$RESTORE_DIR"
for dir in pg_notify pg_replslot pg_serial pg_snapshots pg_stat pg_stat_tmp pg_tblspc pg_twophase \
  pg_commit_ts pg_dynshmem pg_subtrans pg_multixact pg_logical pg_logical/snapshots \
  pg_logical/mappings pg_wal/archive_status pg_wal/summaries; do
  mkdir -p "$RESTORE_DIR/$dir"
done
rm -f "$RESTORE_DIR/postmaster.pid"

echo "· Starting restored database on 127.0.0.1:$RESTORE_PORT"
./node_modules/.bin/pglite-server --db="$RESTORE_DIR" --port="$RESTORE_PORT" --host=127.0.0.1 --max-connections=4 \
  > /tmp/axon-restore-$STAMP.log 2>&1 &
RESTORE_PID=$!
cleanup() {
  kill "$RESTORE_PID" 2>/dev/null || true
  wait "$RESTORE_PID" 2>/dev/null || true
  if [[ -z "$KEEP" ]]; then rm -rf "$RESTORE_DIR"; else echo "· Scratch restore kept at $RESTORE_DIR"; fi
}
trap cleanup EXIT

for _ in $(seq 1 40); do
  if ss -ltn 2>/dev/null | grep -q ":$RESTORE_PORT "; then break; fi
  sleep 0.5
done
if ! ss -ltn 2>/dev/null | grep -q ":$RESTORE_PORT "; then
  echo "Restored database did not start. See /tmp/axon-restore-$STAMP.log" >&2
  exit 1
fi

SOURCE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54329/postgres?sslmode=disable&connection_limit=1&pgbouncer=true&schema=public}"
RESTORE_URL="postgresql://postgres:postgres@127.0.0.1:$RESTORE_PORT/postgres?sslmode=disable&connection_limit=1&pgbouncer=true&schema=public"

echo "· Comparing source and restored databases"
SOURCE_URL="$SOURCE_URL" RESTORE_URL="$RESTORE_URL" npx tsx scripts/verify-restore-parity.ts
