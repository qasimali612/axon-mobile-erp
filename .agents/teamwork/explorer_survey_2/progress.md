# Progress — Explorer 2 (Order-to-Cash & Accounting Explorer)

Last visited: 2026-11-09T18:17:15Z

## Status
Starting systematic code and schema audit for Order-to-Cash & Accounting.

## Steps
- [x] Initialized DISPATCH.md and BRIEFING.md
- [ ] Inspect Prisma schema for Sales Invoice, Approval, Payment, AR, GL, Inventory, StockMovement, DeviceIdentifier, PhysicalStockUnit
- [ ] Search for Approval workflows, statuses, maker-checker, and permissions in Sales Invoice codebase
- [ ] Investigate invoice `ISB--SI-FY2026-27-000004` and numbering sequence logic
- [ ] Investigate Sales Invoice posting engine (atomicity, concurrency locks, serialized vs non-serialized stock movements, COGS calculation, tax snapshotting, GL balancing, audit logs)
- [ ] Investigate AR & Customer Subledger reconciliation with GL AR control account
- [ ] Investigate Payment Receipt & Allocation engine (multi-invoice allocations, customer advances, reversals, overdue calculation)
- [ ] Investigate Sales Return & Credit Note workflows against original invoices
- [ ] Investigate idempotency mechanisms on posting endpoints
- [ ] Compile comprehensive 5-component handoff report in `handoff.md`
- [ ] Send completion message to parent
