# DATABASE & API ARCHITECTURE AUDIT
**Module:** Cash & Treasury, Banking & General Ledger  
**Database:** PostgreSQL (Cloud DB: `db.prisma.io:5432`)  
**ORM:** Prisma  

---

## 1. PRISMA SCHEMA MODELS & RELATIONSHIPS

The Cash & Treasury architecture relies on 6 core models:

1. **`BankAccount`**:
   - Represents the commercial bank account master (e.g. `0001` · Faysal Bank).
   - Links 1-to-1 to an Asset account in the Chart of Accounts (`glAccountId` -> `Account`).
   - Scoped to `companyId` and `branchId`.

2. **`BankTransaction`**:
   - Created automatically whenever a Journal Entry impacts the linked `BankAccount`.
   - Stores `deposit`, `withdrawal`, `transactionDate`, and `reconciliationStatus` (`UNRECONCILED` / `RECONCILED`).
   - Links to `journalEntryId` and `journalLineId`.

3. **`BankStatement`**:
   - Stores the external bank statement header: `statementNumber`, `periodStart`, `periodEnd`, `openingBalance`, `closingBalance`.
   - Strict period validation prevents overlapping statement periods for the same bank account.

4. **`BankStatementLine`**:
   - Stores individual rows from the bank statement: `transactionDate`, `reference`, `description`, `deposit`, `withdrawal`.
   - Has unique link `matchedJournalLineId` ensuring evidence-to-GL 1-to-1 parity.

5. **`BankReconciliation`**:
   - Manages the reconciliation workflow (`DRAFT`, `COMPLETED`, `REOPENED`).
   - Stores calculated totals: `bookBalance`, `statementBalance`, `outstandingDeposits`, `outstandingPayments`, `adjustedBalance`.

6. **`JournalEntry` & `JournalEntryLine`**:
   - The authoritative double-entry General Ledger.

---

## 2. API ENDPOINTS & SECURITY

| Route | Method | Required Permission | Invariants Enforced |
|---|---|---|---|
| `/api/finance/bank-accounts` | GET, POST | `BANK_LEDGER_VIEW` / `MANAGE` | Multi-branch filter, GL class must be ASSET |
| `/api/finance/bank-transactions` | GET | `BANK_LEDGER_VIEW` | Includes `POSTED` and `REVERSED` entries |
| `/api/finance/banking/transfers` | GET, POST | `BANK_LEDGER_VIEW` / `POST` | Strict double-entry contra vouchers, distinct source/destination |
| `/api/finance/bank-statements` | GET, POST | `BANK_RECONCILIATION_PREPARE` | Period overlap checks, non-zero lines validation |
| `/api/finance/bank-statements/[id]/match` | POST | `BANK_RECONCILIATION_PREPARE` | Exact amount checks, candidate filtering |
| `/api/finance/bank-reconciliations/[id]/complete` | POST | `BANK_RECONCILIATION_APPROVE` | Balanced reconciliation required ($|Adjusted - Statement| \le 0.005$) |
| `/api/finance/bank-reconciliations/[id]/reopen` | POST | `BANK_RECONCILIATION_APPROVE` | Mandatory justification reason, audit log |

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
