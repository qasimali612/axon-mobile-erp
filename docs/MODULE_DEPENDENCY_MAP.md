# Integrated ERP module dependency map

Updated: 2026-10-27

## Non-negotiable architecture

```text
Company / branch / warehouse / user / RBAC / audit
                    │
                    ├── Fiscal calendar ──> period posting guard ──> period close
                    │
                    ├── Chart of accounts ──> balanced journal engine ──> general ledger
                    │                                  │
                    │                                  ├── trial balance
                    │                                  ├── profit and loss
                    │                                  ├── balance sheet + explicit difference
                    │                                  └── cash-flow classification
                    │
Product / variant ──┼── inventory identity ──> movement ledger ──> stock valuation
                    │             │                    │
                    │             ├── procurement ─────┼──> supplier subledger / payable
                    │             ├── sales ───────────┼──> customer subledger / receivable
                    │             └── returns ─────────┴──> atomic stock + journal reversal
                    │
                    ├── bank accounts ──> bank transaction ledger ──> reconciliation
                    ├── fixed assets ──> depreciation schedule ──> posted depreciation / disposal
                    ├── incentives ──> approved accrual ──> payable or receivable ──> settlement
                    ├── rebates ─────> approved accrual ──> payable or receivable ──> settlement
                    └── budgets + cost centers ──> posted-actual comparison
```

## Authoritative ledgers

| Domain | Authority | Derived views | Invariant |
|---|---|---|---|
| Inventory | Immutable inventory movement ledger | On-hand, available, valuation, aging | One physical dual-SIM device is one stock unit with multiple unique identifiers |
| Accounting | Posted `JournalEntry` and `JournalEntryLine` | GL, statements, dashboards, subledgers | Base debit equals base credit before posting |
| Bank | Posted journal bank lines and `BankTransaction` | Bank balance and reconciliation | A bank movement never exists without its journal line |
| Customer | Posted lines carrying `customerId` | Statement and aging | Control-account effect is source-generated |
| Supplier | Posted lines carrying `supplierId` | Statement and aging | Control-account effect is source-generated |
| Assets | Asset register + posted asset journals | Cost, accumulated depreciation, NBV | Disposal cannot silently alter acquisition history |
| Incentives | Approved calculation + accrual journal | Payable/receivable and settlement status | Cash settlement clears an accrual; it does not recognize income or expense again |
| Rebates | Approved calculation + accrual journal | Payable/receivable and settlement status | Cash settlement clears an accrual; it does not recognize income or expense again |
| Budgets | Versioned budget lines | Budget-versus-actual | Actuals always come from posted journal lines |

## Dependency rules

1. No operational source can post without an open period, valid branch, active account mapping, and an idempotency key.
2. Serialized inventory, quantity inventory, subledger effect, tax effect, and GL effect commit atomically.
3. Customer and supplier balances are dimensions on posted journal lines, not editable summary fields.
4. Posted vouchers are immutable. A correction is a separately numbered, linked reversal in an open period.
5. Draft, submitted, approved, rejected, and failed records never enter financial statements.
6. A closed or soft-closed period rejects new posting at both application and database layers.
7. Report filters use one posting-date basis and the configured fiscal calendar.
8. Company and branch scope is enforced in the server query, not only in navigation.
9. Export is a distinct authority and creates an append-only audit event.
10. The permanently excluded after-sales case-management scope has no schema, route, permission, navigation, report, seed, notification, or planned-module dependency.

## Delivery state

| Capability | Schema | Backend | UI | RBAC | Audit / guards | Tests | State |
|---|---:|---:|---:|---:|---:|---:|---|
| Foundation and identity | Yes | Yes | Yes | Yes | Yes | Yes | Verified Phase 1 |
| Fiscal calendar | Yes | Yes | Yes | Yes | Yes | Pending expanded suite | Core rollout |
| Chart of accounts | Yes | Yes | Yes | Yes | Yes | Pending expanded suite | Core rollout |
| Journals and GL | Yes | Yes | Yes | Yes | Yes | Pending expanded suite | Core rollout |
| Trial balance and statements | Yes | Yes | Yes | Yes | Export audited | Pending expanded suite | Core rollout |
| Bank ledger | Yes | Read path | Yes | Yes | Linked to journal | Pending | Partial |
| Bank reconciliation | Yes | Close checks only | Read path | Yes | Yes | Pending | Partial |
| Fixed assets | Yes | Read path | Yes | Yes | Journal links | Pending | Partial |
| Incentives | Yes | Read path | Yes | Yes | Journal links | Pending | Partial |
| Rebates | Yes | Read path | Yes | Yes | Journal links | Pending | Partial |
| Budgets | Yes | Actual comparison | Yes | Yes | Approval fields | Pending | Partial |
| Inventory movement ledger | Not yet | Not yet | Not yet | Cataloged | Planned | Pending | Not complete |
| Procurement and sales posting | Not yet | Not yet | Not yet | Cataloged | Planned | Pending | Not complete |

A module is not complete merely because its table or page exists. Completion requires verified schema, migration, backend transaction, connected UI, server RBAC, audit evidence, posting rules, failure handling, and automated tests.
