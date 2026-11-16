# AXON MOBILE ERP — OPENING STOCK AUDIT REPORT
**Company:** AXON · Gondal Mobile Center  
**System:** Axon Mobile ERP  
**Directory:** `D:\Inventory Managment Software`  
**Current Period:** November 2026 · FY2026-27  
**Opening Stock Value:** PKR 1,025,740  
**Audit Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary

An exhaustive audit of the inventory initialization records for **Gondal Mobile Center** was performed. The company's genuine opening inventory of **PKR 1,025,740** was originally initialized across three stock adjustment vouchers:
1. `ISB--SA-FY2026-27-000001` (09-Nov-2026): **PKR 756,410** (14 lines of physical devices & accessories)
2. `ISB--SA-FY2026-27-000002` (02-Nov-2026): **PKR 266,780** (6 lines of physical stock)
3. `ISB--SA-FY2026-27-000003` (02-Nov-2026): **PKR 2,550** (1 line of accessories)
**Total Combined Opening Stock:** **PKR 1,025,740.00**

### Critical Audit Finding
The initial stock import had debited **Account 1200 (Merchandise Inventory - Asset)** and credited **Account 4030 (Inventory Adjustment Gain)**. Because Account 4030 carries `accountClass: REVENUE` in the standard Chart of Accounts, its PKR 1,025,740 credit balance was erroneously leaking into the Profit & Loss statement under `otherIncome`. This caused:
* Net Profit to falsely surge from genuine trading profit of **PKR 16,966** to an artificial **PKR 1,042,706**.
* Gross trading profit and financial dashboard KPIs to be distorted by treating capital goods brought into the business as trading revenue.

### Corrective Implementation
1. **Asset Classification Preserved:** Account 1200 (Merchandise Inventory) maintains custody of all physical units, IMEI numbers, and stock valuation intact.
2. **Profit & Loss Isolation:** Opening stock initialization has been strictly excised from P&L revenue, gross profit, and operating income calculations.
3. **Balance Sheet Equity Recognition:** The opening inventory value of PKR 1,025,740 is recognized on the Balance Sheet under **Equity (Opening Stock Equity Reserve)**, ensuring the fundamental accounting equation balances perfectly:
   $$\text{Assets} = \text{Liabilities} + \text{Equity}$$
4. **Permanent Engine Guard:** Future adjustments with `reason: "OPENING_STOCK"` post directly to Equity (`RETAINED_EARNINGS` / `CAPITAL_RESERVE`) rather than revenue gain accounts.

---

## 2. Inventory Subledger & Asset Verification

* **Inventory Account:** `1200 · Merchandise Inventory`
* **Account Type:** Asset
* **Classification:** Current Asset
* **Normal Balance:** Debit
* **Physical Warehouse:** `ISB-RETAIL · Main Shop` (Islamabad Blue Area)
* **Valuation Method:** Moving Average / Specific Identification for Dual-SIM IMEI Handsets.

All individual handset IMEIs and accessory quantities in the 21 item lines remain fully registered in `PhysicalDevice` and `StockBatch` subledgers without any duplication or truncation.

---

© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
