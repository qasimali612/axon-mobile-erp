# POS API AUDIT — AXON MOBILE ERP
**Module:** Point of Sale (POS) API Layer  
**Framework:** Next.js Route Handlers (App Router)  
**Audit Date:** November 2026  
**Auditor:** Backend API & Security Specialist  

---

## 1. Existing POS-Related Endpoints

| Endpoint | Method | Purpose | Status | Gaps / Vulnerabilities |
|---|---|---|---|---|
| `/api/operations/catalog/resolve` | `GET` | Barcode, SKU, IMEI1/IMEI2 resolution | **Operational** | Clean resolution. Validates `IN_STOCK` status, warehouse matching, and reservation conflicts. |
| `/api/operations/catalog/search` | `GET` | Fuzzy search for catalog by name, model, SKU, barcode | **Operational** | Server-side pagination, branch warehouse scoping, handles quantity vs serialized items. |
| `/api/catalog/prices/resolve` | `GET` | Resolve applicable price and floor | **Operational** | Evaluates price lists, customer hierarchy, and enforces minimum floor price. |
| `/api/sales/invoices` | `POST` | Create sales invoice draft | **Operational** | Standard sales order-to-cash creation. |
| `/api/sales/invoices/[id]/post` | `POST` | Direct post invoice to GL & deduct stock | **Operational** | Single-user & multi-user direct posting with trigger guard bypass. |
| `/api/payments` | `POST` | Create customer receipt voucher | **Operational** | Creates payment draft with allocation. |
| `/api/payments/[id]/post` | `POST` | Post payment voucher to GL | **Operational** | Posts cash/bank entries. |

---

## 2. API Architectural Gap: The Multi-Step Checkout Problem

Currently, the POS frontend coordinates checkout via client-driven choreography:
```
Client Browser
   │
   ├─► 1. POST /api/sales/invoices (Save draft)
   │
   ├─► 2. POST /api/sales/invoices/[id]/post (Post to GL & Deduct Inventory)
   │
   ├─► 3. POST /api/payments (Create receipt draft)
   │
   └─► 4. POST /api/payments/[id]/post (Post receipt to GL)
```

### Critical Flaws:
1. **No Single Atomic Transaction:** If step 2 succeeds but step 3 or 4 fails due to network drop or validation error, the sales invoice is posted as an unpaid receivable, and the cashier's drawer is not updated.
2. **Double-Click Vulnerability:** If the cashier presses `Ctrl+Enter` twice rapidly, separate drafts could be created before client-side disable takes effect.
3. **No Split-Tender Payload:** The existing flow assumes either a full payment or a single advance. It cannot accept an array of tender allocations (e.g., `[{ method: "CASH", amount: 20000 }, { method: "BANK", amount: 30000 }]`).

---

## 3. Specification for Dedicated Atomic POS Checkout API

To achieve SAP Business One counter terminal reliability, we introduce a unified endpoint:
`POST /api/pos/checkout`

### Request Payload:
```json
{
  "branchId": "UUID",
  "warehouseId": "UUID",
  "customerId": "UUID",
  "salespersonId": "UUID",
  "terminalId": "UUID (Optional)",
  "shiftId": "UUID (Optional)",
  "priceListId": "UUID (Optional)",
  "invoiceDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD (Optional, for credit balance)",
  "notes": "POS Checkout Counter Remarks",
  "idempotencyKey": "pos-checkout-UUID",
  "lines": [
    {
      "productId": "UUID",
      "variantId": "UUID",
      "taxRuleId": "UUID (Optional)",
      "taxRate": "0",
      "quantity": "1",
      "unitPrice": "224999.0000",
      "discountAmount": "0",
      "stockUnitIds": ["UUID"]
    }
  ],
  "tenders": [
    {
      "paymentMethod": "CASH",
      "cashAccountId": "UUID",
      "amount": "100000.0000",
      "tenderedAmount": "100000.0000",
      "changeAmount": "0.0000"
    },
    {
      "paymentMethod": "CARD",
      "bankAccountId": "UUID",
      "reference": "POS-CARD-99120",
      "amount": "124999.0000"
    }
  ],
  "isCreditSale": false,
  "creditOverrideReason": "Optional justification if credit limit exceeded"
}
```

### Atomic Execution Flow (Single `prisma.$transaction`):
1. Re-lock and validate customer, dispatch warehouse, and salesperson.
2. Re-lock and validate handset physical stock units (status `IN_STOCK`, warehouse matching, no reservation conflicts).
3. Re-lock and validate accessory stock balances and reservations.
4. Calculate totals, server-side taxes, discounts, and floor prices.
5. Create `SalesInvoice` record.
6. Generate balanced GL Journal Entry for Sales & COGS.
7. Post `StockMovement` records (deducting inventory value and updating physical units to `SOLD`).
8. If non-credit or advance tenders exist:
   - Create and post `Payment` records for each tender.
   - Create `PaymentAllocation` records linking payments to the `SalesInvoice`.
   - Post balanced Cash/Bank GL Journal Entries.
9. Mark `SalesInvoice` status as `POSTED`.
10. Commit transaction and return invoice ID, invoice number, and receipt data.

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
