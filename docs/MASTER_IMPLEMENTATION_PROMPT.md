# Master implementation prompt — integrated mobile inventory and finance ERP

Use this prompt for every implementation phase. Do not mark a capability complete until its full definition of done is evidenced.

## Mission

Build a production-grade, multi-branch mobile-device ERP integrating catalog, serialized inventory, procurement, sales, returns, payments, fixed assets, incentives, rebates, budgeting, banking, and financial accounting. Preserve working modules and add capabilities through reviewed migrations and cohesive transaction services.

The after-sales case-management/workshop scope is permanently excluded. Do not create related entities, screens, APIs, permissions, scheduled work, reports, notifications, fixtures, dashboard references, or roadmap items.

## Required technical behavior

1. Inspect the repository, framework, database, current modules, incomplete workflows, and dependency graph before coding.
2. PostgreSQL/Prisma is the canonical database design. Use migrations, foreign keys, unique constraints, check constraints, indexes, row locks, transactions, and idempotency.
3. Use decimal/fixed-point values for money and valuation. Never calculate business money with binary floating point.
4. Treat company as the tenant boundary and enforce branch/warehouse scopes in every server query and mutation.
5. Enforce permissions server-side. Create, submit, approve, post, settle, reverse, close, reopen, and export are separate authorities.
6. Require maker-checker-poster segregation for journals and opening balances.
7. Keep posted journals immutable. Correct them through an authorized linked reversal in an open period.
8. Reject posting to soft-closed or closed periods at application and database layers.
9. Derive every dashboard and report figure from posted transactions. Draft or approved-but-unposted data never affects statements.
10. Preserve full source traceability from journal line to source document and from source document to stock/subledger effects.
11. Make the inventory movement ledger authoritative. A physical dual-SIM device owns multiple unique identifiers but remains one stock unit.
12. Commit source status, inventory movements, serialized-device state, subledger dimensions, journal lines, bank rows, idempotency, and audit effect atomically.
13. Accrue incentives and rebates once. Settlement clears the payable/receivable and must not recognize income or expense again.
14. Never hide a balance-sheet difference with a synthetic balancing row.
15. Use one configurable fiscal-calendar and posting-date basis consistently across statements and periodic reports.
16. Do not hardcode production secrets or leave a known default production password.
17. Provide structured logs, environment validation, backup/restore instructions, and secure error responses.

## Required finance capabilities

- Filterable database-derived finance dashboard with company, period, branch, bank, party, and salesperson dimensions
- Hierarchical configurable chart of accounts
- Fiscal years, periods, soft close, final close, and controlled reopen
- Journal draft, submit, approve, post, and reversal lifecycle
- General ledger and source drill-down
- Customer, supplier, cash, and bank ledgers; aging and allocations
- Bank statement import, matching, reconciliation, approval, and reopen
- Fixed-asset register, capitalization, depreciation, impairment, transfer, and disposal
- Incentives payable and receivable with effective-dated rules and return adjustments
- Rebates payable and receivable with accrual/settlement separation
- Opening-balance import, validation, approval, and posting
- Budgets, versions, cost centers, departments, and variance reports
- Profit and loss, balance sheet, trial balance, cash flow, and periodic comparisons
- Controlled CSV/XLSX/PDF export with audit evidence

## Definition of done for one module

A module is complete only when all are true:

- Schema and reversible/safe migration exist
- Foreign keys, constraints, indexes, decimals, and tenant guards exist
- Backend transaction and validation exist
- UI is connected to real records and handles success, validation, conflict, empty, and permission states
- Server-side RBAC and data scope are tested
- Audit events and immutable/reversal behavior are tested
- Posting matrix entries are implemented and reconciled
- Idempotency and concurrent duplicate requests are tested
- Reports derive from the posted effect
- Unit, integration, database-control, and E2E tests pass
- Operator/API/deployment documentation is current
- The acceptance workflow has database evidence

A table alone, an attractive empty screen, a disabled mock button, or a successful HTTP response without verified database effects is not completion.

## Phase order

1. Dependency inspection and safe migration plan
2. Fiscal calendar, chart of accounts, journals, GL, and statements
3. Customer/supplier/bank subledgers and reconciliation
4. Inventory identity and immutable movement ledger
5. Procurement and supplier settlement
6. Sales, returns, customer settlement, and COGS
7. Fixed assets
8. Incentives and rebates
9. Budgets, cost centers, close, and opening conversion
10. Twenty acceptance workflows, security, performance, backup/recovery, and rollout guides

## Required artifacts per release

- Updated dependency map
- Migration plan and migration SQL
- Accounting posting matrix
- Permission matrix
- Module implementation checklist
- API reference
- Environment example
- Development/test seed policy
- Automated test output
- Deployment, backup/restore, role, LAN, printer/scanner, and troubleshooting guides
- Acceptance evidence with source IDs, journal IDs, movement IDs, balances, and audit IDs
