# Deployment guide — Windows LAN production

**Status:** delivered. Every command in this guide exists in `package.json` and has been executed in
this workspace.

---

## 1. Topology

```text
Authorized Windows clients ── HTTPS 443 ── Reverse proxy (IIS/ARR, Caddy, nginx)
                                                 │
                                        Next.js app 127.0.0.1:3000
                                                 │
                                   PostgreSQL 5432 (private, app host only)
```

* Clients never reach PostgreSQL.
* The application must be reached through one stable hostname; session cookies use `Secure`,
  `SameSite=None`, `Partitioned` so the ERP works inside managed browser frames.
* The database host is private; firewall allows only the application host.

## 2. Prerequisites

| Component | Version | Notes |
| --- | --- | --- |
| Node.js | 20 LTS | Runtime for the app and the maintenance scripts |
| PostgreSQL | 16+ | Production database (this workspace uses the PGlite socket server for dev/acceptance) |
| Reverse proxy | IIS+ARR, Caddy or nginx | TLS termination, HTTP/2 |
| OS | Windows Server 2019+ | Or Linux, same steps |

## 3. Environment file

Copy `.env.example` to `.env` on the server (never commit it):

```dotenv
DATABASE_URL="postgresql://axon_app:<long-random-password>@127.0.0.1:5432/axon_erp?sslmode=require&connection_limit=10&schema=public"
SESSION_COOKIE_NAME=axon_session
ENCRYPTION_KEY=<32+ byte random value>
APP_URL=https://erp.company.lan
NODE_ENV=production
```

Rules:

* `DEMO_SEED` / `NEXT_PUBLIC_DEMO_MODE` must be **false** in production.
* Generate `ENCRYPTION_KEY` once, store it in the password manager **and** the sealed recovery envelope; bank account numbers cannot be decrypted without it.
* No default password may remain active: the owner bootstrap forces a password change on first login.
* Use separate PostgreSQL roles: migration owner (DDL), application role (DML only), backup role (read-only backup rights).

## 4. Install and build

```powershell
git clone <repo> C:\axon-erp && cd C:\axon-erp
npm ci
npx prisma generate
npx prisma migrate deploy      # migration-owner credentials only
npm run build
```

## 5. Release gates (run before every deployment)

```powershell
npx tsc -p tsconfig.foundation.json     # 0 errors
npx tsc -p tsconfig.finance.json        # 0 errors
npx tsc -p tsconfig.ops.json            # 0 errors
npx tsc -p tsconfig.scripts.json        # 0 errors
npx eslint .                            # 0 errors
npm run build                           # succeeds
npx vitest run                          # unit tests green
```

For the module-level functional gates run `npm run acceptance:all` (19 suites, one database) and see
`docs/ACCEPTANCE-MATRIX.md`.

## 6. First start

1. Start the app (`npm run start`, or as a service — see §7).
2. Visit `https://erp.company.lan` and confirm the login screen renders with the blue theme and no preview credentials.
3. Bootstrap the owner once with `npx tsx scripts/init-admin.ts` (reads the bootstrap variables), then delete those variables from `.env` and restart.
4. Sign in, change the password, create branches, warehouses, users and roles.
5. Configure chart of accounts, payment methods, bank accounts, price lists, tax rules.
6. Load opening balances through the approved opening-balance workflow; never insert ledger rows directly.
7. Release to staff by role.

## 7. Run as a Windows service

```powershell
npm install -g win-node-env            # optional helper
nssm install AxonERP "C:\Program Files\nodejs\npm.cmd" "run start"
nssm set AxonERP AppDirectory C:\axon-erp
nssm set AxonERP AppEnvironmentExtra NODE_ENV=production
nssm start AxonERP
```

Linux equivalent: a `systemd` unit running `npm run start` with `EnvironmentFile=/opt/axon-erp/.env`.

## 8. Health, smoke and rehearsals

| Task | Command | Expected |
| --- | --- | --- |
| Database reachable | `curl https://erp.company.lan/api/system/health` | `{"status":"ok","database":"reachable"}` |
| Page + API smoke, concurrency | `npm run smoke` | all pages render, no 5xx, latency under ceiling |
| Migration state and guards | `npm run db:migration-rehearsal` | every migration applied, checksums match, ledger balanced |
| Backup + restore drill | `npm run db:backup` | parity across counts, triggers and ledger |
| Module acceptance | `npm run acceptance:all` | 19 suites pass, 0 failed (see `docs/ACCEPTANCE-MATRIX.md`) |
| Reporting parity | `npm run test:reporting-acceptance` | CSV exports and print layouts reconcile |

## 9. Upgrade procedure

1. Take and verify a backup (`npm run db:backup`).
2. Stop the service.
3. `git fetch && git checkout <release-tag>`, `npm ci`, `npx prisma generate`.
4. `npx prisma migrate deploy` (forward-only; migrations are immutable).
5. `npm run build`, then start the service.
6. Verify `/api/system/health`, sign in, open **Reports & exports**, confirm the trial balance still balances.
7. Record release tag, migration count, operator and time in the release log.

Rollback: restore the previous release tag and the verified backup. Never attempt to reverse a
migration in place; migrations are forward-only by policy.

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `P1001` / health shows database unreachable | Wrong host/port, firewall, connection limit | Check `DATABASE_URL`, `pg_hba.conf`, firewall rules, `connection_limit` |
| Login loops back to sign-in | Proxy headers not forwarded, clock skew, cookie blocked | Forward `X-Forwarded-Host`/`-Proto`, sync time, allow the cookie |
| `ORIGIN_REJECTED` on saving | Proxy rewrites `Host` | Preserve the original host header |
| Only some branches visible | Role location scope | Check `UserRole` branch/warehouse scope |
| `409` duplicate SKU/barcode | Intentional uniqueness guard | Search archived records instead of forcing |
| Slow lists | Missing filters or large page size | Use date/branch filters; confirm indexes |
| Export button says the grant is missing | Role lacks `FINANCIAL_REPORTS_EXPORT` | Grant to owner/auditor only, with approval |
| Print preview shows pricing but the printer does not | Browser print dialog, not the app | Use the preview page's **Print / save PDF**; see `docs/LAN-PRINTER-SCANNER.md` |

## 11. Offline statement

A LAN outage means clients cannot post. This is deliberate: the system does not claim offline ERP
capability, and the browser cache is not a data store. If offline operation is ever required, it must
be delivered as a separate synchronisation architecture with server-side stock/IMEI revalidation
before posting.

## Embedded-preview mode (`PREVIEW_IFRAME_MODE`)

The application is normally opened directly at its own origin, where a `SameSite=Lax` session cookie
works. When it is instead embedded in a **third-party iframe** (an IDE or platform preview pane), that
cookie is discarded by the browser, and the login POST succeeds while the follow-up `/api/auth/me`
check fails — the sign-in screen then reports *"Sign-in was verified, but this browser did not retain
the secure session."*

`PREVIEW_IFRAME_MODE="true"` changes three things, and only for that scenario:

| Behaviour | Normal (`false`) | Preview (`true`) |
| --- | --- | --- |
| `axon_session` cookie | `SameSite=Lax` | `SameSite=None; Secure` |
| Second partitioned cookie | not set | `axon_preview_session` (CHIPS, `Partitioned`) |
| Cookie-less recovery | none | reuses a session created in the last 30 minutes whose **client IP and user-agent match exactly** |

Rules:

* Keep `.env.example` (and every deployed environment) at `"false"`. The fingerprint fallback weakens
  session binding and must never be active for real users on a LAN or the internet.
* The fallback only reuses sessions it can still expire, revoke and scope normally — it does not bypass
  permissions, company scoping or the audit trail.
* Because the recovery window is 30 minutes, a preview user who never receives the cookie must sign in
  again after that window; browsers that accept the partitioned cookie keep the full 12-hour session.

## Rebuilding a sandbox from a clean checkout

`node_modules` and `.next` are not part of a workspace snapshot, and background processes do not survive
a restart. `bash scripts/prepare-preview.sh` restores both in the only order that fits the memory
budget: install, `prisma generate`, then `next build` **with the database stopped** (PGlite plus a build
worker exceeds the container limit and the worker is killed with `SIGKILL`). Afterwards start
`bash scripts/db-start.sh`, then `npm run start`.

