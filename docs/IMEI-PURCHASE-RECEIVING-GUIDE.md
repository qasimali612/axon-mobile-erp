# Purchasing and Recording IMEI Stock

## Where to start

Use **Procurement → Purchase / receive stock** (`/goods-receipts/new`). A Purchase Order is optional.

Before receiving a phone, its product/variant must exist in **Product Catalog** with:

- Product type: Smartphone or Feature Phone
- Tracking type: IMEI
- A unique product SKU and variant SKU
- The correct color/storage/RAM variant
- Purchase and selling prices
- An optional product barcode (the barcode identifies the variant; it is not the phone's individual IMEI)

## Option A — Receive against a Purchase Order

1. Create one Purchase Order containing all required products and quantities.
2. Submit and approve the PO.
3. Open **Purchase / receive stock**.
4. Select **Against approved PO** and choose the PO.
5. The outstanding PO lines load automatically.
6. Change received quantities for this delivery. This supports partial delivery.

The PO records the commercial order. IMEIs are recorded only when the physical phones arrive on a Goods Receipt.

## Option B — Direct purchase/receipt without a PO

1. Open **Purchase / receive stock**.
2. Select **Direct receipt**.
3. Enter a reason, supplier, branch, receiving warehouse, receipt date, and supplier invoice/delivery references.
4. Add products using catalog search, barcode/SKU scan, or CSV/XLSX import.

Direct receipt requires the configured permission. It creates the same controlled GRN, stock movement, landed cost, payable, and accounting records when posted.

## Recording the phones

For every IMEI-tracked product line:

1. Enter the **physical quantity** received.
2. Click **Record IMEIs**.
3. Enter one physical phone per row.
4. Put **IMEI 1 and IMEI 2 on the same row** for a dual-SIM phone.
5. Leave IMEI 2 blank for a single-IMEI phone.
6. Use Enter after scanning to advance to the next field/device.

Example concept:

| Physical phone | IMEI 1 | IMEI 2 |
|---|---|---|
| Unit 1 | Valid 15-digit IMEI from phone 1 | Second IMEI from phone 1 |
| Unit 2 | Valid 15-digit IMEI from phone 2 | Second IMEI from phone 2 |

Two IMEIs on one row still create **one** `PhysicalStockUnit` and one unit of stock.

The screen validates:

- One identifier row for every physical phone
- Valid 15-digit IMEI format and Luhn check digit
- No repeated IMEI inside the GRN
- Company-wide IMEI uniqueness
- One primary IMEI and unique SIM slots
- Product/variant and warehouse eligibility

The server repeats all checks inside the posting transaction, so browser changes or concurrent submissions cannot bypass them.

## Spreadsheet import

Use CSV or XLSX with these columns:

```text
sku,quantity,unitCost,imei1,imei2
PHONE-VARIANT-SKU,1,206000,<phone-1-imei-1>,<phone-1-imei-2>
PHONE-VARIANT-SKU,1,206000,<phone-2-imei-1>,<phone-2-imei-2>
ACCESSORY-SKU,10,3500,,
```

Use one row per serialized phone. Quantity-only accessories do not need IMEIs.

## Posting lifecycle

1. **Save draft** — stores the document and staged IMEIs; no stock or accounting effect.
2. **Submit** — routes the GRN for inspection/approval; stock is unchanged.
3. **Inspect**, when enabled — records accepted, rejected, or quarantined results.
4. **Approve** — authorizes posting; stock is still unchanged.
5. **Post** — atomically creates physical stock units, IMEI identifiers, inventory movements, balances, landed cost, payable journal, and audit history exactly once.

Rejected units do not become available stock.

## Verifying the result

Open **Inventory → IMEI Registry** (`/inventory/imei`). Search either IMEI to view the same phone and its:

- Product and variant
- IMEI 1 / IMEI 2
- Supplier and GRN
- Purchase date and permitted cost
- Current branch, warehouse, and status
- Sales invoice and customer, if sold
- Returns and full movement timeline

An available phone appears as **Available**. A posted sale changes it to **Sold** and removes warehouse custody. Draft sales never change the device status.
