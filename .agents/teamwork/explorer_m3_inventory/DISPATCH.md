# Dispatch — Explorer M3 Inventory

Working Directory: d:\Inventory Managment Software\.agents\teamwork\explorer_m3_inventory\
Original Request: d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md
Scope Document: d:\Inventory Managment Software\.agents\teamwork\orchestrator\PROJECT.md
## 2026-11-16T08:28:45Z
You are teamwork_explorer assigned to Milestone 3 (Direct Atomic POS Posting Engine & GL Accounting) — Dual Inventory Custody & Actual Costing.

Working Directory: d:\Inventory Managment Software\.agents\teamwork\explorer_m3_inventory\
Mandatory Request: d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md
Scope Document: d:\Inventory Managment Software\.agents\teamwork\orchestrator\PROJECT.md

## Mission & Scope:
You are a read-only exploration agent. DO NOT modify codebase source files.
Investigate the technical implementation requirements for inventory deduction and actual costing during counter checkout:
1. Examine `PhysicalStockUnit`, `DeviceIdentifier`, `StockMovement`, and `StockBalance` schemas in `prisma/schema.prisma`.
2. Inspect serialized mobile phone tracking:
   - How `PhysicalStockUnit` availability is validated (`status: 'IN_STOCK'`, `currentWarehouseId === warehouseId`, `invoiceId === null`).
   - How duplicate handset scans are prevented in cart lines and checkout validation.
   - How `PhysicalStockUnit` is updated on sale (`status: 'SOLD'`, `invoiceId: invoice.id`, etc.).
   - How `StockMovement` is recorded (movement type `SALE`, quantity 1, reference to invoice and unit).
3. Inspect non-serialized quantity items (accessories / spare parts):
   - How `StockBalance` is queried and validated (`quantityOnHand >= quantity`).
   - How negative stock is strictly prevented.
   - How `StockBalance.quantityOnHand` and `quantityAvailable` are updated.
   - How `StockMovement` is recorded for quantity items.
4. Cost of Goods Sold (COGS) calculation:
   - For serialized handsets: specific identification using `PhysicalStockUnit.acquisitionCost` (or `landedCost`). Verify what field stores actual acquisition cost.
   - For quantity accessories: moving average unit cost or configured inventory costing policy from `StockBalance`.
   - Total COGS calculation formula and rounding rules.

Output Requirements:
- Record your progress in `progress.md` with `Last visited:` timestamps.
- Author a comprehensive, verified handoff report in `d:\Inventory Managment Software\.agents\teamwork\explorer_m3_inventory\handoff.md` following the 5-component protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method).
- Send completion message back to orchestrator.
