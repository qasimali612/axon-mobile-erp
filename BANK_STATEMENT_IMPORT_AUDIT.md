# BANK STATEMENT IMPORT & RECONCILIATION AUDIT
**Module:** Cash & Treasury — Statement Import  
**Company:** Gondal Mobile Center  
**Branch:** ISB – Islamabad  

---

## 1. EVIDENCE-ONLY ARCHITECTURAL PRINCIPLE

In Axon Mobile ERP, the General Ledger is the single source of financial truth. Bank statements represent external audit evidence provided by commercial banks.

### Core Architectural Invariant:
$$\text{Bank Statement Import} \implies \text{Zero GL Journal Entries Generated}$$

- Bank statements are imported into the `BankStatement` and `BankStatementLine` tables.
- Importing a statement never creates, posts, modifies, or reverses a `JournalEntry` or `JournalEntryLine`.
- Reconciliation functions strictly by linking an evidence line (`BankStatementLine`) to an existing posted transaction (`BankTransaction` / `JournalEntryLine`).

---

## 2. CSV / EXCEL FILE IMPORT CAPABILITY

`StatementEditor` in `src/components/finance/banking-workspace.tsx` has been upgraded to include direct CSV and text file parsing:
- **Supported Formats:** `.csv`, `.tsv`, `.txt`
- **Supported Delimiters:** Comma (`,`), Tab (`\t`), Semicolon (`;`), Pipe (`|`)
- **Column Detection:** Date, Reference / Cheque #, Description / Particulars, Deposit / Credit, Withdrawal / Debit, Balance.
- **Date Format Normalization:** Automatically converts DD/MM/YYYY, DD-MM-YYYY, and YYYY-MM-DD into ISO date strings.
- **Auto Calculation:** Automatically computes total net movements, expected closing balance, and statement period bounds.

---

## 3. MATCHING ENGINE & RECONCILIATION REPORTING

### Matching Controls:
1. **Exact Amount Matching:** Matches candidate posted bank transactions with $|\text{line.amount} - \text{candidate.amount}| \le 0.005$.
2. **One-to-One Protection:** Enforced by unique constraint `BankStatementLine.matchedJournalLineId`. One bank transaction cannot be linked to multiple statement lines.
3. **Reconciliation Balancing Requirement:**
   The completion endpoint `/api/finance/bank-reconciliations/[id]/complete` strictly blocks finalization unless:
   $$|\text{Adjusted Book Balance} - \text{Statement Closing Balance}| \le 0.005$$
4. **Reopening Audit Trail:** Completed reconciliations can only be reopened by authorized supervisors (`BANK_RECONCILIATION_APPROVE`) with a mandatory audit reason logged in `AuditLog`.

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
