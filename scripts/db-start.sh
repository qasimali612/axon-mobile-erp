#!/usr/bin/env bash
# Starts the persistent PGlite socket database used by local development and acceptance runs.
# Empty PostgreSQL runtime directories are recreated first because the workspace snapshot
# does not preserve empty directories.
set -euo pipefail
DB_DIR="${DB_DIR:-./.pglite/axon-erp}"
PORT="${DB_PORT:-54329}"
for dir in pg_notify pg_replslot pg_serial pg_snapshots pg_stat pg_stat_tmp pg_tblspc pg_twophase \
  pg_commit_ts pg_dynshmem pg_subtrans pg_multixact pg_logical pg_logical/snapshots \
  pg_logical/mappings pg_wal/archive_status pg_wal/summaries; do
  mkdir -p "$DB_DIR/$dir"
done

# A workspace restore can leave a postmaster.pid behind while no server is listening.
# PostgreSQL (and PGlite) abort on startup in that case, so move the stale marker aside.
if [ -f "$DB_DIR/postmaster.pid" ] && ! (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
  mv "$DB_DIR/postmaster.pid" "$DB_DIR/postmaster.pid.stale.$(date +%s)"
  echo "Removed stale postmaster.pid (no listener on port $PORT)"
fi
exec ./node_modules/.bin/pglite-server --db="$DB_DIR" --port="$PORT" --host=127.0.0.1 --max-connections=20
