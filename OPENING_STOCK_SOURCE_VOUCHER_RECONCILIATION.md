# OPENING STOCK SOURCE VOUCHER RECONCILIATION
**Company:** AXON · Gondal Mobile Center  
**Branch:** ISB · Islamabad Blue Area  
**Warehouse:** ISB-RETAIL · Main Shop  
**Total Reconciled Value:** PKR 1,025,740.00  

---

## 1. Reconciliation Overview

The opening stock value of **PKR 1,025,740** comprises three posted operational stock adjustment vouchers. Each voucher represents physical inventory imported at system cutover for Gondal Mobile Center.

| Voucher Number | Voucher Date | Posting Date | Warehouse | Reason Code | Lines | Total Value (PKR) | Linked GL Voucher |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `ISB--SA-FY2026-27-000001` | 09-Nov-2026 | 09-Nov-2026 | `ISB-RETAIL` | `OPENING_STOCK` | 14 | 756,410.00 | `ISB--SAV-FY2026-27-000001` |
| `ISB--SA-FY2026-27-000002` | 02-Nov-2026 | 02-Nov-2026 | `ISB-RETAIL` | `OPENING_STOCK` | 6 | 266,780.00 | `ISB--SAV-FY2026-27-000002` |
| `ISB--SA-FY2026-27-000003` | 02-Nov-2026 | 02-Nov-2026 | `ISB-RETAIL` | `OPENING_STOCK` | 1 | 2,550.00 | `ISB--SAV-FY2026-27-000003` |
| **Combined Opening Total** | — | — | — | — | **21** | **PKR 1,025,740.00** | **Balanced to GL** |

---

## 2. Line Item Audit & Physical Custody

### Voucher 1: `ISB--SA-FY2026-27-000001` (PKR 756,410.00)
* **Date:** 09-Nov-2026
* **Reason:** `OPENING_STOCK` (Opening Stock Import)
* **Status:** `POSTED`
* **Lines:** 14 lines comprising premium dual-SIM mobile handsets (Infinix, Tecno, Redmi, Vivo) and accessories:
  * Handsets tracked by unique 15-digit IMEI 1 and IMEI 2 numbers.
  * Valued at genuine supplier procurement unit cost.
  * Debited to `1200 Merchandise Inventory`: **Rs 756,410.00**.

### Voucher 2: `ISB--SA-FY2026-27-000002` (PKR 266,780.00)
* **Date:** 02-Nov-2026
* **Reason:** `OPENING_STOCK` (Opening Stock Initial Batch)
* **Status:** `POSTED`
* **Lines:** 6 lines comprising feature phones and quantity-tracked stock:
  * Quantity: 6 lines, 0 rejected.
  * Debited to `1200 Merchandise Inventory`: **Rs 266,780.00**.

### Voucher 3: `ISB--SA-FY2026-27-000003` (PKR 2,550.00)
* **Date:** 02-Nov-2026
* **Reason:** `OPENING_STOCK` (Opening Stock Minor Batch)
* **Status:** `POSTED`
* **Lines:** 1 line of retail accessory stock:
  * Debited to `1200 Merchandise Inventory`: **Rs 2,550.00**.

---

## 3. Physical Inventory & Integrity Verification

1. **Exact-Once Counting:** All 21 lines were verified against the physical custody register. There are zero duplicate IMEI entries or duplicated batch records.
2. **COGS Tracking:** When handsets from this opening stock are sold (e.g. Sales Invoice `ISB--SI-FY2026-27-000004` and `ISB--SI-FY2026-27-000008`), their exact unit cost (e.g. Rs 26,880 and Rs 55,000) is deducted from Account 1200 and recognized as Cost of Goods Sold (Account 5000), preserving exact gross margin tracking.
3. **Audit Immutability:** The historical operational vouchers remain fully intact and immutable with full audit logs preserved.

---

© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
