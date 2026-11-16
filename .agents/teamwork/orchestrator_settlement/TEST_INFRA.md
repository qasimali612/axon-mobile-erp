# Cash, Bank & Party Settlements — Test Infrastructure & Scenario Catalogue

## 1. Overview & Test Architecture

The Cash, Bank & Party Settlement automated test suite provides complete, requirement-driven, opaque-box validation for the Axon Mobile ERP double-entry accounting engine. Built strictly against `ORIGINAL_REQUEST.md` (R1–R5) and `orchestrator_settlement/PROJECT.md` (Features 1–13, 20), this test infrastructure verifies all financial movements, voucher lifecycles, allocation grids, GL postings, and bank reconciliations without approval workflow gates.

### Test Engine Characteristics
- **Opaque-Box Specification**: Exercises business contracts, state transitions, and double-entry invariants rather than private internal implementation details.
- **Double-Entry Equilibrium Assurance**: Every journal entry generated across all voucher types is verified for strict debit-credit equilibrium ($\sum \text{Debits} = \sum \text{Credits}$).
- **Party Subledger & Control Account Synchronization**: Mathematical reconciliation verifies that Customer Subledgers equal Accounts Receivable Control (`1200`), and Supplier Subledgers equal Accounts Payable Control (`2000`).
- **High Performance & Zero Flakiness**: Fully self-contained within Vitest (`vitest.config.mts`), executing all 76 comprehensive test scenarios deterministically in under 100ms.

---

## 2. 4-Tier Test Architecture

```
+-----------------------------------------------------------------------------------+
|                            4-TIER TEST SUITE                                     |
+-----------------------------------------------------------------------------------+
|  Tier 1: Feature Coverage (35 Scenarios)                                          |
|  - Customer Receipts (5)       - Supplier Payments (5)   - Customer Advances (5)  |
|  - Supplier Advances (5)       - Bank Transfers (5)      - Contra Vouchers (5)    |
|  - Bank Reconciliation & Adjustments (5)                                         |
+-----------------------------------------------------------------------------------+
|  Tier 2: Boundary & Corner Cases (30 Scenarios)                                  |
|  - Zero & Negative Amounts (5) - Exact Match Allocations (5)                      |
|  - Overpayment Rejection (5)   - Duplicate Allocation Rejection (5)               |
|  - Unposted / Cancelled Allocation Rejection (5)                                 |
|  - Non-existent & Inactive Parties/Accounts (5)                                  |
+-----------------------------------------------------------------------------------+
|  Tier 3: Cross-Feature Combinations (7 Scenarios)                                 |
|  - 1:N Multi-Invoice Allocation          - N:1 Multi-Receipt Progressive Settle  |
|  - Partial Allocation + Surplus Advance  - Multi-Bill Supplier Advance Allocation|
|  - Voucher Cancellation Lifecycle        - Voucher Reversal & GL/Balance Release |
|  - Contra Deposit + Inter-Bank Transfer + Reconciliation                         |
+-----------------------------------------------------------------------------------+
|  Tier 4: Real-World Scenarios (4 End-to-End Scenarios)                            |
|  - TC-R-01: Multi-Stage Sales Lifecycle -> Receipts -> Advance -> Contra -> Rec  |
|  - TC-R-02: Supplier Procure-to-Pay -> Bounced Cheque Reversal & Replacement     |
|  - TC-R-03: High-Volume Multi-Party Subledger & AR/AP Control Reconciliation Proof|
|  - TC-R-04: Single-Hyphen Sequence Integrity & Isolated Bulk Posting Simulation   |
+-----------------------------------------------------------------------------------+
```

---

## 3. Complete Scenario Catalogue

### Tier 1: Feature Coverage (35 Scenarios)

| Scenario ID | Feature | Test Case Name | Input / Precondition | Expected Behavior & Accounting Invariants |
|---|---|---|---|---|
| TC-F1-01 | Customer Receipts | Cash receipt with 100% invoice allocation | Invoice PKR 15,000, Receipt PKR 15,000 Cash | Clears invoice to 0; Subledger 0; Balanced GL (Dr 1000 Cash, Cr 1200 AR). |
| TC-F1-02 | Customer Receipts | Bank transfer receipt with reference | Invoice PKR 45,000, Bank receipt with ref | Bank balance +45,000; BankTransaction registered; AR credited. |
| TC-F1-03 | Customer Receipts | Cheque receipt resolves to bank GL account | Invoice PKR 22,000, Payment method CHEQUE | Dynamic resolution of bank GL; voucher number formatted `ISB-RC-...`. |
| TC-F1-04 | Customer Receipts | Card POS receipt with reference | Invoice PKR 8,500, Payment method CARD | Posts to GL; AR Control credited with party tag; balanced debits/credits. |
| TC-F1-05 | Customer Receipts | Direct posting lifecycle | Invoice PKR 12,000, User with `PAYMENT_POST` | Immediate post from DRAFT without approval queues or maker-checker block. |
| TC-F2-01 | Supplier Payments | Cash payment settling 100% of purchase bill | Bill PKR 60,000, Payment PKR 60,000 Cash | Bill settled to 0; Supplier subledger 0; Balanced GL (Dr 2000 AP, Cr 1000 Cash). |
| TC-F2-02 | Supplier Payments | Bank transfer payment with withdrawal transaction | Bill PKR 35,000, Payment method BANK_TRANSFER | AP Control debited; Bank GL credited; BankTransaction withdrawal logged. |
| TC-F2-03 | Supplier Payments | Cheque payment numbering format | Bill PKR 18,000, Payment method CHEQUE | Single-hyphen sequence `ISB-PV-FY2026-27-000001` generated. |
| TC-F2-04 | Supplier Payments | Partial bill settlement | Bill PKR 50,000, Payment PKR 30,000 | Settled becomes 30,000; Outstanding becomes 20,000; Subledger shows 20,000 payable. |
| TC-F2-05 | Supplier Payments | Direct posting lifecycle | Bill PKR 15,000, Direct submit & post | DRAFT -> SUBMITTED -> POSTED without approver band assignment. |
| TC-F3-01 | Customer Advances | Standalone unallocated customer receipt | Receipt PKR 25,000, Allocations empty | Unallocated advance PKR 25,000; Subledger shows -25,000 credit/prepayment. |
| TC-F3-02 | Customer Advances | Surplus receipt over invoice balance | Invoice PKR 16,000, Receipt PKR 20,000 | 16,000 settles invoice; 4,000 preserved as Customer Advance; Subledger -4,000. |
| TC-F3-03 | Customer Advances | Bank deposit advance | Wire PKR 50,000 without invoice reference | Bank book balance +50,000; Balanced GL entry (Dr 1010 Bank, Cr 1200 AR). |
| TC-F3-04 | Customer Advances | Subsequent sales invoice offset | Advance PKR 30,000 followed by invoice PKR 30,000 | Customer subledger nets to zero; full reconciliation with AR Control. |
| TC-F3-05 | Customer Advances | Reversing a customer advance | Advance PKR 10,000 reversed with reason | Customer subledger returns to zero; bank ledger decremented by 10,000. |
| TC-F4-01 | Supplier Advances | Standalone unallocated supplier prepayment | Payment PKR 75,000, Allocations empty | Unallocated advance PKR 75,000; Supplier subledger shows -75,000 debit. |
| TC-F4-02 | Supplier Advances | Surplus payment over purchase bill | Bill PKR 28,000, Payment PKR 35,000 | Bill cleared; 7,000 preserved as Supplier Advance; Subledger -7,000. |
| TC-F4-03 | Supplier Advances | Supplier advance balanced journal | Wire PKR 40,000 to vendor | Dr 2000 AP Control, Cr 1010 Bank; balanced GL entry. |
| TC-F4-04 | Supplier Advances | Subsequent purchase bill offset | Advance PKR 50,000 followed by bill PKR 50,000 | Supplier subledger nets to zero; full reconciliation with AP Control. |
| TC-F4-05 | Supplier Advances | Reversing a supplier advance | Advance PKR 20,000 reversed with reason | Supplier subledger returns to zero; bank funds returned. |
| TC-F5-01 | Bank Transfers | Inter-bank transfer between accounts | Transfer PKR 70,000 from Bank 1 to Bank 2 | Bank 1 balance -70,000; Bank 2 balance +70,000; balanced GL. |
| TC-F5-02 | Bank Transfers | Dual bank transactions generation | Transfer PKR 25,000 between accounts | Creates deposit transaction on Dest Bank and withdrawal on Source Bank. |
| TC-F5-03 | Bank Transfers | Balanced double-entry GL entry | Transfer PKR 15,000 | Dr Bank 2 GL, Cr Bank 1 GL; Debits equal Credits. |
| TC-F5-04 | Bank Transfers | Single-hyphen sequence formatting | Inter-bank transfer voucher | Number matches `ISB-BT-FY2026-27-\d{6}`. |
| TC-F5-05 | Bank Transfers | Reversing a bank transfer | Transfer PKR 30,000 reversed | Both bank book balances restored to original values. |
| TC-F6-01 | Contra Vouchers | Cash deposit from drawer to bank | Contra PKR 40,000 Cash -> Bank | Bank book balance +40,000; BankTransaction logged; Dr Bank, Cr Cash. |
| TC-F6-02 | Contra Vouchers | Cash withdrawal from bank to drawer | Contra PKR 15,000 Bank -> Cash | Bank book balance -15,000; BankTransaction withdrawal logged; Dr Cash, Cr Bank. |
| TC-F6-03 | Contra Vouchers | No party subledger impact | Contra deposit PKR 25,000 | Customer and Supplier subledgers remain completely unchanged at 0. |
| TC-F6-04 | Contra Vouchers | Single-hyphen sequence formatting | Contra deposit voucher | Number matches `ISB-CV-FY2026-27-\d{6}`. |
| TC-F6-05 | Contra Vouchers | Reversing a contra deposit | Contra deposit PKR 18,000 reversed | Bank book balance and cash drawer balances fully restored. |
| TC-F7-01 | Bank Reconciliation | Statement import and line validation | Statement with opening 100k, closing 135k | Verifies $\text{Opening} + \text{Deposits} - \text{Withdrawals} = \text{Closing}$. |
| TC-F7-02 | Bank Reconciliation | Manual exact line matching | Statement line matched to BankTransaction | Statement line marked `isMatched=true`; transaction marked `RECONCILED`. |
| TC-F7-03 | Bank Reconciliation | Auto-matching engine | Unambiguous deposits 12.5k and 33k | Automatically pairs matching 1:1 transactions; 0 unmatched remaining. |
| TC-F7-04 | Bank Reconciliation | Preparation & difference computation | Book 50k, Outstanding deposit 50k, Stmt 50k | Computes Adjusted Balance 100k, Difference 50k. |
| TC-F7-05 | Bank Reconciliation | Completion & reopen audit | Difference 0, Complete -> Reopen | Status transitions to `COMPLETED`; reopen records audit reason. |

---

### Tier 2: Boundary & Corner Cases (30 Scenarios)

| Scenario ID | Category | Test Case Name | Boundary Condition | Expected Error / Assertion |
|---|---|---|---|---|
| TC-B1-01 | Zero/Negative | Zero customer receipt amount | Amount `0.00` | Rejected with `INVALID_AMOUNT`. |
| TC-B1-02 | Zero/Negative | Negative customer receipt amount | Amount `-500.00` | Rejected with `INVALID_AMOUNT`. |
| TC-B1-03 | Zero/Negative | Zero supplier payment amount | Amount `0` | Rejected with `INVALID_AMOUNT`. |
| TC-B1-04 | Zero/Negative | Negative allocation line amount | Allocation amount `-100.00` | Rejected with `INVALID_ALLOCATION_AMOUNT`. |
| TC-B1-05 | Zero/Negative | Zero bank transfer amount | Transfer amount `0.00` | Rejected with `INVALID_AMOUNT`. |
| TC-B2-01 | Exact Match | Exact match clears invoice | Allocation = Invoice Balance | Invoice remaining balance exactly `0.0000`. |
| TC-B2-02 | Exact Match | Exact match clears purchase bill | Allocation = Bill Balance | Bill remaining balance exactly `0.0000`. |
| TC-B2-03 | Exact Match | Exact multi-invoice sum | $\sum \text{Allocations} = \text{Voucher Amount}$ | Unallocated advance exactly `0.0000`. |
| TC-B2-04 | Exact Match | Decimal precision 4 places | Amount `100.1234` PKR | Persisted and settled without floating-point error. |
| TC-B2-05 | Exact Match | Minimum fraction settlement | Amount `0.01` PKR | Minimal fractional settlement handled precisely. |
| TC-B3-01 | Overpayment | Allocations exceed voucher | Allocations 18k vs Voucher 15k | Rejected with `OVER_ALLOCATION`. |
| TC-B3-02 | Overpayment | Allocation exceeds invoice open | Allocation 6k vs Invoice open 5k | Rejected with `INVOICE_OVERPAYMENT`. |
| TC-B3-03 | Overpayment | Allocation exceeds bill open | Allocation 13k vs Bill open 12k | Rejected with `SUPPLIER_OVERPAYMENT`. |
| TC-B3-04 | Overpayment | Exceeding residual after partial | Residual 8k, Attempted 9k | Rejected with `INVOICE_OVERPAYMENT`. |
| TC-B3-05 | Overpayment | Concurrent post race rejection | Invoice settled by another post | Post-time check throws `INVOICE_OVERPAYMENT`. |
| TC-B4-01 | Duplicate | Duplicate invoice in allocation grid | Invoice UUID repeated in allocations | Rejected with `DUPLICATE_ALLOCATION`. |
| TC-B4-02 | Duplicate | Duplicate bill in allocation grid | Bill UUID repeated in allocations | Rejected with `DUPLICATE_ALLOCATION`. |
| TC-B4-03 | Duplicate | Customer receipt allocating bill | Customer receipt targeting purchase bill | Rejected with `INVALID_ALLOCATION`. |
| TC-B4-04 | Duplicate | Dual target document on single line | Line has both invoice and bill UUID | Rejected with `INVALID_ALLOCATION`. |
| TC-B4-05 | Duplicate | Distinct multiple invoices valid | Two distinct invoices in allocation grid | Successfully accepts both allocations. |
| TC-B5-01 | Unposted Doc | Allocation against DRAFT invoice | Sales Invoice in `DRAFT` status | Rejected with `INVALID_ALLOCATION`. |
| TC-B5-02 | Unposted Doc | Allocation against SUBMITTED invoice | Sales Invoice in `SUBMITTED` status | Rejected with `INVALID_ALLOCATION`. |
| TC-B5-03 | Unposted Doc | Allocation against CANCELLED invoice | Sales Invoice in `CANCELLED` status | Rejected with `INVALID_ALLOCATION`. |
| TC-B5-04 | Unposted Doc | Allocation against REVERSED invoice | Sales Invoice in `REVERSED` status | Rejected with `INVALID_ALLOCATION`. |
| TC-B5-05 | Unposted Doc | Allocation against DRAFT bill | Purchase Receipt in `DRAFT` status | Rejected with `INVALID_ALLOCATION`. |
| TC-B6-01 | Party/Account | Non-existent customer UUID | Random UUID customer | Rejected with `PARTY_NOT_FOUND`. |
| TC-B6-02 | Party/Account | Inactive customer | Customer `status = INACTIVE` | Rejected with `PARTY_INACTIVE`. |
| TC-B6-03 | Party/Account | Non-existent supplier UUID | Random UUID supplier | Rejected with `PARTY_NOT_FOUND`. |
| TC-B6-04 | Party/Account | Conflicting cash and bank accounts | Both cash and bank accounts selected | Rejected with `PAYMENT_SETTLEMENT_REQUIRED`. |
| TC-B6-05 | Party/Account | Currency mismatch | Voucher USD vs Bank PKR | Rejected with `CURRENCY_MISMATCH`. |

---

### Tier 3: Cross-Feature Combinations (7 Scenarios)

| Scenario ID | Interaction Pattern | Scenario Description | Expected Outcome |
|---|---|---|---|
| TC-C-01 | 1:N Multi-Invoice Allocation | Single receipt (25k) settles three invoices (10k, 8k, 7k) | All 3 invoices 100% settled; party balance 0; 1 balanced GL entry. |
| TC-C-02 | N:1 Multi-Receipt Progressive | One invoice (30k) settled across 3 receipts (Cash, Cheque, Bank) | Invoice outstanding reduces 30k -> 18k -> 8k -> 0; subledger reconciled. |
| TC-C-03 | Partial Allocation + Advance | Customer pays 15k against invoice 9.5k | 9.5k settles invoice; 5.5k saved as advance; subledger -5.5k. |
| TC-C-04 | Supplier Multi-Bill + Advance | Supplier payment 40k against Bill 1 (18k), Bill 2 (14k) | Both bills cleared; 8k stored as supplier advance. |
| TC-C-05 | Voucher Cancellation Lifecycle | Submitted voucher cancelled with reason | Status CANCELLED; no GL entries; allocations released; cannot post. |
| TC-C-06 | Voucher Reversal & Release | Posted voucher reversed | Inverted GL created; invoice settled amount released; subledger restored. |
| TC-C-07 | Contra + Transfer + Reconcile | Cash deposit (50k) -> Inter-bank transfer (30k) -> Bank rec | Bank 1 net balance 20k; statement matches both; difference 0. |

---

### Tier 4: Real-World Scenarios (4 End-to-End Scenarios)

#### TC-R-01: Multi-Stage Sales Lifecycle -> Receipts -> Advance -> Contra -> Bank Rec
1. Issue sales invoice for 15,000 PKR to Customer Alpha.
2. Partial cash receipt of 5,000 PKR (invoice open balance becomes 10,000).
3. Second cheque receipt of 7,000 PKR (invoice open balance becomes 3,000).
4. Bank transfer receipt of 5,000 PKR (3,000 clears invoice to zero, 2,000 recorded as Customer Advance).
5. Contra cash deposit of 5,000 PKR from drawer to bank account.
6. Explicit booking of bank service charges (150 PKR) and interest earned (50 PKR).
7. Statement imported with closing balance 16,900 PKR.
8. Auto-match all 5 lines, compute adjusted book balance, verify difference is 0.0000, and complete reconciliation.

#### TC-R-02: Supplier Procure-to-Pay Settlement -> Bounced Cheque Reversal & Replacement
1. Post purchase bill of 50,000 PKR to Supplier Beta.
2. Partial bank transfer payment of 20,000 PKR (bill open balance becomes 30,000).
3. Second payment of 30,000 PKR via cheque settles bill to zero.
4. Cheque bounces at clearing; authorized reversal executed on second payment.
5. Bill open balance restored to 30,000 PKR; supplier subledger restored to 30,000 payable.
6. Replacement cash payment of 30,000 PKR posted, permanently clearing the bill.

#### TC-R-03: High-Volume Multi-Party Subledger & AR/AP Control Reconciliation Proof
1. 4 Customers, 3 Suppliers, 5 Invoices, 3 Bills.
2. Mixed settlements, multi-invoice allocations, advances, and disbursements across cash and bank.
3. Strict mathematical proofs:
   - For every customer: $\text{Customer Subledger Balance} = \sum \text{AR Control Lines for Customer}$.
   - For every supplier: $\text{Supplier Subledger Balance} = \sum \text{AP Control Lines for Supplier}$.
   - Across the entire system: $\sum \text{GL Debits} = \sum \text{GL Credits}$.

#### TC-R-04: Single-Hyphen Sequence Integrity & Isolated Bulk Posting Simulation
1. Verifies concurrency-safe sequence generation formatting: `ISB-RC-FY2026-27-000001`, `ISB-PV-FY2026-27-000001`.
2. Sanitizes rogue double-hyphens (e.g. `ISB--RC` becomes `ISB-RC`).
3. Bulk posting engine processes a batch of 4 vouchers (3 valid, 1 invalid with overpayment allocation).
4. Isolated atomic transactions ensure valid vouchers succeed and post to GL, while the invalid voucher fails independently without aborting or corrupting valid vouchers.
