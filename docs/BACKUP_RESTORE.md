# Backup, restore and recovery runbook

**Status:** implemented and rehearsed. `npm run db:backup` is the tested procedure; every run must
be recorded in the drill log at the end of this page.

---

## 1. What must be backed up

| Asset | Location | Why it matters |
| --- | --- | --- |
| Database | `PGLITE_DIR` (default `./.pglite/axon-erp`) | Every business record, ledger, audit row |
| Application source | Git repository | Redeployable release |
| Environment file | `.env` on the server, never in Git | `DATABASE_URL`, `SESSION_*`, `ENCRYPTION_KEY` |
| Backups directory | `BACKUP_DIR` (default `./backups`) | Off-host copies |
| Uploaded attachments | `UPLOAD_DIR` if configured | Purchase attachments |

Losing `.env` while holding a database copy is a full outage: the `ENCRYPTION_KEY` protects bank
account numbers, so a restore without the matching key leaves those fields unreadable. Store the key
in the password manager and in the sealed recovery envelope.

## 2. Backup procedure (rehearsed)

```bash
# 1. Stop the application so no write is in flight (the script refuses to run otherwise)
# 2. Take a consistent copy of the database directory
npm run db:backup            # bash scripts/backup-restore-rehearsal.sh
```

The script:

1. Refuses to run while the application is listening on port 3000.
2. Forces a `CHECKPOINT` (`scripts/db-checkpoint.ts`) so dirty shared buffers are in the data files
   before the copy; without it a file copy is only crash-consistent.
3. Archives the database directory to `backups/axon-erp-<timestamp>.tar.gz` (excluding stale `*.pid`).
4. Extracts the archive into a temporary directory.
5. Boots a second database server on port 54331 from the restored copy.
6. Runs `scripts/verify-restore-parity.ts`, which compares:
   * migration history and checksums,
   * required integrity triggers,
   * twelve critical row counts (companies, users, products, stock units, invoices, receipts,
     journal entries, journal lines, audit logs, budgets, incentives, rebates, assets),
   * the ledger debit/credit totals.
7. Stops the temporary server and deletes the scratch restore unless `--keep` is passed.

Expected output ends with:

```text
✓ 39 migrations restored with identical history
✓ database guards present on AuditLog, JournalEntry, ...
✓ ledger totals identical · debit ... · credit ...
Backup and restore rehearsal passed.
```

For production PostgreSQL, the same rehearsal shape applies with `pg_dump -Fc` /
`pg_restore --clean --if-exists` into a scratch database, then the same parity script pointed at the
scratch database through `SOURCE_URL` / `RESTORE_URL`.

## 3. Backup schedule

| Frequency | Type | Retention | Storage |
| --- | --- | --- | --- |
| Every 15 minutes | WAL / continuous archive (production PostgreSQL) | 7 days | Off-host object storage |
| Nightly 01:00 | Logical backup (`npm run db:backup` or `pg_dump -Fc`) | 30 days | Off-host, encrypted |
| Weekly Sunday | Logical backup copied off-site | 12 weeks | Separate region/account |
| Monthly | Full logical + restore rehearsal into scratch | 12 months | Cold storage |

Keep at least one backup outside the office and away from the server's credentials.

## 4. Restore procedure

1. Announce the maintenance window; stop the application.
2. Move the current database directory aside (never delete before the restore is verified):
   `mv .pglite/axon-erp .pglite/axon-erp.failed-$(date +%Y%m%d-%H%M%S)`
3. Extract the chosen archive into place:
   `mkdir -p .pglite/axon-erp && tar -xzf backups/axon-erp-<stamp>.tar.gz -C .pglite/axon-erp`
4. Remove `postmaster.pid` if present.
5. Start the database (`npm run db:start` / `bash scripts/db-start.sh`), then the application.
6. Verify: `npm run db:migration-rehearsal`, then `npm run smoke`.
7. Sign in, open **Reports & exports**, and confirm the trial balance still balances and one recent
   invoice/GRN opens and prints.
8. Record the drill.

## 5. Point-in-time and partial recovery

* **Accidental posting** — never delete rows. Use the module's own reversal/cancellation flow; the
  ledger and stock ledgers are append-only and the audit trail must stay intact.
* **Corrupted migration** — migrations are immutable. Write a new forward migration; the
  `db:migration-rehearsal` script fails if an applied migration file was edited.
* **Single company/period restore** — restore the whole database into scratch, export the needed
  records with the CSV registers, and re-enter them through the UI so audit and posting rules apply.

## 6. Verification checklist after any restore

| Check | Command / screen | Pass criterion |
| --- | --- | --- |
| Migrations | `npm run db:migration-rehearsal` | all applied, checksums match, entries balanced |
| Health | `/api/system/health` | `status: ok`, database reachable |
| Smoke | `npm run smoke` | all pages/APIs respond, concurrency clean |
| Ledger | Reports → Statements | balance difference `0.00` |
| Registers | Reports & exports | CSV exports reconcile to on-screen counts |
| Auth | sign in with owner, then a scoped user | correct menus, no cross-branch data |

## 7. Drill log

| Date | Backup file | Restore target | Parity | Operator | Notes |
| --- | --- | --- | --- | --- | --- |
| _add a row for every drill_ | | | | | |

## Embedded-database write durability (PGlite)

The development/preview database is an embedded PGlite cluster backed by real files, but its
PostgreSQL process keeps dirty pages in memory and flushes them when it shuts down cleanly. A process
that is **killed** (power loss, container eviction, snapshot restore) can lose the writes committed
since the last flush — this exact failure produced a torn WAL and an unrecoverable cluster during
development.

Rules that follow from that:

* Always stop the database with `SIGTERM` (the `pglite-server` handler prints `Server stopped`), never
  with `SIGKILL`. A graceful stop flushes every committed transaction.
* Before any long-lived state change (seeding, migrations), stop and restart the database once so the
  state is on disk; then take a backup.
* If a cluster refuses to start with `PANIC: could not locate a valid checkpoint record`, the data
  directory is corrupt. Do not try to repair it. Move it aside, initialise a fresh cluster, run
  `npx prisma migrate deploy`, seed, and restore the most recent validated archive.
* Production must use a real PostgreSQL server with `fsync=on`, `synchronous_commit=on`, WAL archiving
  and `pg_basebackup`/`pg_dump` — the embedded engine is a local-development convenience only.

The drill log for this delivery:

```text
2026-10-30 08:53  archive 7.3 MB · checkpoint forced · restored on :54331
                  39 migrations, guards on 6 tables, 13 counts identical,
                  ledger debit = credit = 9,449,072.5564 · PASS
```
