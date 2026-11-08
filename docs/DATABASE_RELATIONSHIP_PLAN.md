# Database relationship plan

## Existing foundation

- `Company` → branches, warehouses, memberships, roles, catalog, finance masters, journals, parties, banks, assets, plans, budgets, audit
- `User` → memberships → scoped role assignments → roles → permissions
- `Product` → variants → barcodes
- `Warehouse` → hierarchical locations
- `Session` → active company/branch/warehouse context

## Finance masters

- `Company` 1—N `FiscalYear` 1—N `AccountingPeriod`
- `Company` 1—N `AccountGroup` with self-referencing hierarchy
- `Company` 1—N `Account` with optional group, parent, branch, and cost center
- `Company` 1—N `CostCenter`, `Department`, `Customer`, `Supplier`
- `Account` has immutable historical use through journal lines; deactivation never deletes history

## General ledger

- `JournalEntry` belongs to company, branch, period, preparer, optional approver, poster, and reverser
- `JournalEntry` 1—N `JournalEntryLine`
- Each line belongs to an account and branch and may carry cost center, department, customer, supplier, bank, salesperson, invoice, and due-date dimensions
- `JournalEntry` self-references through `reversalOfId`
- Source trace fields retain module, document type, ID, number, and idempotency key

## Banking

- `BankAccount` maps one-to-one to its GL account within a company
- `BankTransaction` maps one-to-one to a journal line
- `BankStatement` 1—N `BankStatementLine`
- A statement line may match one journal line
- `BankReconciliation` belongs to one bank account and one statement and retains preparer/completer custody

## Fixed assets

- `AssetCategory` holds default life/method and four account mappings
- `FixedAsset` belongs to category, branch, optional supplier/department/custodian, and explicit account mappings
- `FixedAsset` 1—N `AssetDepreciationSchedule`
- `FixedAsset` 1—N `AssetTransaction`
- `FixedAsset` 0—1 `AssetDisposal`
- Schedules and disposals link to journals

## Incentives

- `IncentivePlan` owns effective-dated rules and payable/receivable account mappings
- `IncentiveCalculation` captures eligible quantity/sales, calculation detail, approval, recipient, and accrual journal
- `IncentiveCalculation` 0—1 `IncentivePayable` 1—N `IncentivePayment`
- `ReceivedIncentive` captures supplier/payer receivable accrual 1—N `ReceivedIncentivePayment`
- Accrual and settlement journal IDs are distinct

## Rebates

- `RebateProgram` defines direction, party, rules, accounting treatment, and account mappings
- `RebateCalculation` links eligible values, approval, accrual journal, and either:
  - `RebateReceivable` 1—N `RebateReceipt`, or
  - `RebatePayable` 1—N `RebatePayment`
- Settlement rows link to their own bank and journal records

## Budgets and opening balances

- `Budget` belongs to fiscal year and optional branch/department/cost center
- `Budget` 1—N `BudgetLine`, unique per account and period
- `OpeningBalanceBatch` belongs to a fiscal year and eventual opening journal
- `OpeningBalanceBatch` 1—N `OpeningBalanceLine` with optional customer, supplier, bank, asset, reference, and due date
- `FinancialPeriodClose` is unique per period and retains checklist, requester, approver, close/reopen times, and reason

## Inventory target relationships

```text
ProductVariant 1──N PhysicalStockUnit 1──N DeviceIdentifier
Warehouse      1──N InventoryMovement N──1 PhysicalStockUnit/ProductVariant
SourceDocument 1──N InventoryMovement
SourceDocument 1──1 JournalEntry (per configured posting event)
```

A multi-identifier device has one physical stock-unit row. Identifier count must never be summed as stock quantity.

## Integrity policy

- Foreign-key delete behavior is Restrict for financial and operational history.
- Detail drafts may cascade only where no posted history can exist (for example, unposted budget/opening import lines).
- Posted history rejects update/delete through triggers and service state machines.
- Cross-company references are rejected.
- Monetary checks enforce non-negative values and one-sided debit/credit rows.
- Unique company document numbers and idempotency keys prevent duplicate posting.
- Date and status indexes support period reports and close checks.
