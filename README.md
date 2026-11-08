# Axon Mobile ERP

A production-oriented mobile-phone inventory ERP built incrementally around strict serialized-device, warehouse, authorization, audit, and accounting controls.

## Delivery status

The ERP is **feature-complete for the agreed scope and release-gated**: every module below is backed by
the database, server-side rules, permissions, audit events and a passing acceptance suite. The chain
`npm run acceptance:all` runs 20 suites against one database and must be green before a release.

Delivered and regression-covered:

- PostgreSQL + Prisma schema, 40 forward migrations, append-only audit log enforced by both the
  application writer and a database trigger, concurrency-safe document sequences
- Secure database-backed sessions, bcrypt hashing, login throttling and lockout, forced first-password
  change, session revocation, multi-company membership with branch/warehouse scope and server-side RBAC
- Company, branch, warehouse and bin hierarchy; users, roles, permissions and amount-banded approval
  policies
- Catalog: products, variants, barcodes, tracking policy (IMEI/serial/batch/quantity), min/max stock,
  preferred supplier, supplier item codes, price lists, payment methods, categories, brands, units
- Procurement: optional purchase orders, multi-product goods receipts (PO-based or direct), inspection,
  landed cost, purchase returns, attachments
- Sales: simple direct invoices or order-linked, barcode/IMEI scanning, price-list resolution and floor
  prices, discount cap, credit-limit control, POS, thermal receipt, sales returns
- Inventory: IMEI registry with dual-SIM identity, authoritative movement ledger, transfers, adjustments
  with actual cost, snapshot stock counts, reservations, valuation, device label sheets
- Finance: chart of accounts, maker–checker–poster journals, reversals, periods, banking and
  reconciliation, fixed assets with depreciation, budgets, incentives, rebates, customer/supplier
  subledgers with aging
- Reports and output: nine operational reports, financial statements, four finance registers, all with
  audited server-side CSV; server-side PDF for invoice/GRN/PO; browser print layouts; saved views;
  recurring report schedules with a host-scheduler runner
- Operations: global search, real XLSX import, notifications, audit register, health endpoint,
  smoke/concurrency check, migration rehearsal, backup/restore rehearsal, deployment and LAN docs

Deliberately **not** claimed (see `docs/MASTER-SCOPE-AUDIT.md` §13): a separate AP invoice with 3-way
match/GRNI, sales order/quotation documents, requisition/RFQ modules, product imagery, tiered quantity
breaks, e-mail delivery of schedules (files land in `exports/`; the host mail relay distributes them),
offline operation, and a multi-hour production soak test. Warranty, repair-job, service-centre and
collection-point modules remain permanently out of scope.

## Technology

- Next.js 15, React 19, TypeScript
- Tailwind CSS, reusable shadcn-style components, Recharts
- PostgreSQL, Prisma ORM, decimal-safe `DECIMAL(19,4)` monetary fields
- Zod validation, React Hook Form, bcrypt password hashing
- Vitest unit tests

## Quick start (zero-install development database)

Requirements: Node.js 20+.

```bash
npm install
cp .env.example .env      # set DATABASE_URL and SEED_ADMIN_PASSWORD
npm run dev:local
```

`dev:local` runs a durable PGlite PostgreSQL engine on `127.0.0.1:54329`, applies migrations, and loads
development fixtures. PGlite is **not** the multi-PC production database.

Running the two processes by hand instead:

```bash
npm run db:generate && npm run db:deploy && npm run db:seed   # schema + fixtures
bash scripts/db-start.sh                                      # terminal 1
npm run start                                                 # terminal 2
```

Every npm script sources `.env` through `scripts/run-with-env.sh`, because Prisma Client itself only
reads `process.env`. Keep a rebuild away from a running PGlite: stop the database, then `npx next build`.

Open `http://localhost:3000`. For the default development seed only, use `owner@axonmobile.local` with the password supplied through `SEED_ADMIN_PASSWORD` (the local helper defaults to `Inventory!2026`).

The development seed is explicitly blocked when `NODE_ENV=production`. The sign-in interface never displays or prefills credentials.

## Production database setup

1. Provision PostgreSQL 16 or newer.
2. Copy `.env.example` to `.env` and set strong credentials.
3. Apply migrations:

```bash
npm ci
npm run db:generate
npm run db:deploy
```

4. Initialize the first owner once:

```bash
ADMIN_EMAIL="owner@example.com" \
ADMIN_NAME="Business Owner" \
ADMIN_PASSWORD="a-unique-strong-passphrase" \
ADMIN_COMPANY_CODE="COMPANY" \
ADMIN_COMPANY_NAME="Company Legal Name" \
npm run admin:init
```

Remove `ADMIN_PASSWORD` from the environment immediately. The command refuses to reset an existing account and marks the new owner for password change.

5. Build and run:

```bash
npm run build
npm run start
```

For Docker and Windows LAN deployment, read [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Quality commands

```bash
npm run typecheck              # four strict TypeScript projects
npm run lint                   # eslint, zero warnings tolerated
npm test                       # vitest unit suite
npm run build                  # production build
npm run smoke                  # health, 15 pages, 6 APIs, 32-request burst
npm run db:migration-rehearsal # order, checksum drift, guard triggers, balanced ledger
npm run db:backup              # checkpoint, archive, scratch restore, parity
npm run acceptance:all         # 20 database-backed acceptance suites, one database
npm run test:enhancements-acceptance   # policies, catalog depth, PDF/labels, saved views, schedules
npm run reports:run-schedules  # cron entry point for due report schedules
```

The acceptance chain needs the database and the application running; see
[`docs/ACCEPTANCE-MATRIX.md`](docs/ACCEPTANCE-MATRIX.md) for prerequisites, ordering and the
per-module evidence table.

## Important architecture rules

- PostgreSQL is authoritative. A browser is never trusted for prices, totals, permissions, or stock eligibility.
- Every query is company-scoped; roles add branch/warehouse scope.
- Posted finance and inventory records are immutable and corrected with linked reversal vouchers; inventory is authoritative through the append-only movement ledger.
- One physical phone owns multiple unique IMEI identifiers; a dual-SIM handset remains one stock unit.
- Stock value is always derived from posted movements, never from the selling price or a client-side figure.
- “Offline” is not claimed. The current supported local architecture is one central server and connected LAN clients.

## Documentation index

- [Architecture](docs/ARCHITECTURE.md)
- [Module dependency map](docs/MODULE_DEPENDENCY_MAP.md)
- [Database relationship plan](docs/DATABASE_RELATIONSHIP_PLAN.md)
- [Permission matrix](docs/PERMISSION_MATRIX.md)
- [Implementation checklist](docs/MODULE_IMPLEMENTATION_CHECKLIST.md)
- [Finance migration plan](docs/FINANCE_MIGRATION_PLAN.md)
- [Accounting posting matrix](docs/ACCOUNTING_POSTING_MATRIX.md)
- [Master implementation prompt](docs/MASTER_IMPLEMENTATION_PROMPT.md)
- [Current API](docs/API.md)
- [Deployment and LAN setup](docs/DEPLOYMENT.md)
- [Backup and restore](docs/BACKUP_RESTORE.md)
- [Roles, printers, and scanners](docs/OPERATIONS_GUIDE.md)
- [LAN, printer and scanner guide](docs/LAN-PRINTER-SCANNER.md)
- [Acceptance matrix](docs/ACCEPTANCE-MATRIX.md)
- [Current module gap matrix](docs/CURRENT-MODULE-GAP-MATRIX.md)
- [Master scope audit](docs/MASTER-SCOPE-AUDIT.md)
- [Inventory controls](docs/INVENTORY-CONTROLS-GUIDE.md) · [Stock transfers](docs/STOCK-TRANSFER-GUIDE.md) · [Party subledgers](docs/PARTY-SUBLEDGER-GUIDE.md)
- [Pricing and banking](docs/PRICING-BANKING-GUIDE.md) · [Fixed assets](docs/FIXED-ASSETS-GUIDE.md) · [Budgets](docs/BUDGETS-GUIDE.md) · [Incentives and rebates](docs/INCENTIVES-REBATES-GUIDE.md)
- [Commercial policy controls](docs/POLICY-CONTROLS.md) · [Catalog depth and supplier codes](docs/CATALOG-SUPPLIER-GUIDE.md) · [Output, labels and schedules](docs/OUTPUT-AND-SCHEDULES.md)
- [Phase 1 acceptance evidence](docs/PHASE_1_ACCEPTANCE.md)
