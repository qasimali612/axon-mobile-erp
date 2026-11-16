# BRIEFING — 2026-11-10T12:18:30Z

## Mission
Investigate schema, custody, invoice ISB--SI-FY2026-27-000004, sequence formatting, IMEI dual-identifier tracking & concurrency locking, and atomic posting engine with COGS/GL integrity.

## 🔒 My Identity
- Archetype: explorer
- Roles: Schema, Custody & Atomic Posting Engine Explorer
- Working directory: d:\Inventory Managment Software\.agents\teamwork\explorer_survey_4
- Original parent: 801c1388-1cc8-4ee1-9f96-99c33e953b3a
- Milestone: Sales Invoice System Survey & Architecture Analysis

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT modify source code (except files in our working directory)
- Produce comprehensive self-contained handoff.md

## Current Parent
- Conversation ID: 801c1388-1cc8-4ee1-9f96-99c33e953b3a
- Updated: 2026-11-10T12:18:30Z

## Investigation State
- **Explored paths**:
  - `prisma/schema.prisma` (PhysicalStockUnit, DeviceIdentifier, InventoryMovement, SalesInvoice, SalesInvoiceLine, SalesInvoiceUnit, DocumentSequence, Account, JournalEntry)
  - `src/lib/document-sequence.ts`, `src/lib/operations/accounting.ts`, `src/lib/operations/sales.ts`, `src/lib/operations/inventory.ts`, `src/lib/operating-mode.ts`, `src/lib/prisma.ts`
  - `scripts/setup-cloud-db.ts`, `scratch/audit_invoice.mjs`, database snapshots and backups
- **Key findings**:
  1. `ISB--SI-FY2026-27-000004`: Status is currently `APPROVED` due to legacy approval workflow where post required pre-approval. Removing the intermediary transition to `APPROVED` in `postSalesInvoice()` allows invoices in `DRAFT`, `SUBMITTED`, or `APPROVED` to post directly when valid without auto-posting or changing historical rows.
  2. Document sequence double-hyphen was caused by `ISB-` in branch `documentPrefix` combined with `-SI` suffix and old `ON CONFLICT` clause that didn't update `prefix`. Clean sanitization with `replace(/^-+|-+$/g, "")` guarantees single-hyphen `ISB-SI-FY2026-27-000008` while preserving historical records untouched.
  3. Physical handset tracking: 1 phone = 1 `PhysicalStockUnit`. Both IMEI1 and IMEI2 link to that unit via `DeviceIdentifier` (slots 1 & 2). Concurrency is enforced via `SELECT ... FOR UPDATE` (`lockPhysicalStockUnit`), active reservation checks, `version` increment, and `Serializable` transaction isolation.
  4. Atomic posting engine: Executes inside a single `prisma.$transaction`. COGS is strictly derived from actual acquisition cost / weighted average inventory balance (never selling price). GL lines (AR, Revenue, Tax, COGS, Inventory) balance to zero difference. Strict idempotency is maintained via unique keys on movements, journals, and document status checks.
- **Unexplored areas**: None. All survey points fully explored.

## Key Decisions Made
- All technical and architectural details documented for the 5-component handoff report.

## Artifact Index
- DISPATCH.md — Incoming task dispatch record
- BRIEFING.md — Persistent working memory
- progress.md — Heartbeat and task progress log
- handoff.md — Final self-contained 5-component report
