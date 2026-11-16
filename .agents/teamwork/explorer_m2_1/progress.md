# Progress — Explorer M2-1 (Concurrency, Row Locks & Handset Custody)

Last visited: 2026-11-15T12:58:30Z

## Status
Starting investigation into Handset Custody and Concurrency Protection Engine.

## Completed Tasks
- [x] Initialized DISPATCH.md, BRIEFING.md, and progress.md

## In Progress
- [ ] Investigate PhysicalStockUnit, DeviceIdentifier schema & dual-IMEI mapping

## Upcoming Tasks
- [ ] Investigate duplicate IMEI prevention unique constraints
- [ ] Investigate dual-SIM scanning resolution
- [ ] Inspect lockPhysicalStockUnit implementation in inventory.ts and sales.ts
- [ ] Inspect pessimistic locking, raw SQL FOR UPDATE vs Prisma queries
- [ ] Analyze transaction isolation level (Serializable vs ReadCommitted) and locking semantics
- [ ] Analyze race condition handling (409 STOCK_UNIT_UNAVAILABLE)
- [ ] Inspect warehouse custody validation and SOLD transition logic
- [ ] Inspect SALE_ISSUE stock movement generation
- [ ] Write 5-component handoff.md and notify parent
