# POS Frontend System & UI Survey Report

## 1. Observation

### 1.1 Framework, Dependencies, Build and Test Setup
- **File**: `package.json`
  - Next.js: `15.5.28` (App Router under `src/app/`)
  - React: `19.2.0`, React DOM: `19.2.0`
  - Database & ORM: Prisma `6.19.3` with PostgreSQL (`prisma/schema.prisma`)
  - Styling: Tailwind CSS `^3.4.18`, `@tailwindcss/forms`, `lucide-react` (`^0.548.0`)
  - Barcode / Print Generation: `bwip-js` (`^4.11.4`) used for Code128 barcode generation in SVG
  - Forms / Notifications: `react-hook-form`, `zod`, `sonner` (`^2.0.7`)
  - Testing: `vitest` (`^4.1.12`), config at `vitest.config.mts` (`environment: "node"`, `include: ["src/**/*.test.ts"]`).
- **Test execution (`npm test` / `vitest run`)**:
  - Ran 11 test files: `src/lib/utils.test.ts`, `src/lib/finance/banking-validation.test.ts`, `src/lib/catalog/pricing-validation.test.ts`, `src/lib/finance/rebate-price-protection.test.ts`, `src/lib/finance/rebate-validation.test.ts`, `src/lib/finance/asset-validation.test.ts`, `src/lib/finance/money.test.ts`, `src/lib/operations/validation.test.ts`, `src/lib/imei.test.ts`, `src/lib/password-policy.test.ts`, `src/lib/operating-mode.test.ts`.
  - Result: 11 passed (63 tests) in 2.67s.
  - Zero UI or React component tests exist in Vitest suite.
- **Typecheck execution (`npm run typecheck`)**:
  - Failed with exit code 1:
    ```
    src/app/(erp)/sales/[id]/receipt/page.tsx(130,27): error TS2339: Property 'address' does not exist on type '{ name: string; id: string; code: string; registrationNumber: string | null; taxRegistrationNumber: string | null; addressLine1: string | null; addressLine2: string | null; countryCode: string; ... 10 more ...; isActive: boolean; }'.
    src/app/(erp)/sales/[id]/receipt/page.tsx(132,31): error TS2339: Property 'address' does not exist on type '{ name: string; id: string; code: string; registrationNumber: string | null; taxRegistrationNumber: string | null; addressLine1: string | null; addressLine2: string | null; countryCode: string; ... 10 more ...; isActive: boolean; }'.
    ```
  - `prisma/schema.prisma` lines 411-412 define `Branch.addressLine1` and `Branch.addressLine2`; property `address` does not exist on `Branch`.

### 1.2 POS Routing & Page Structure
- **Route**: `/pos` at `src/app/(erp)/pos/page.tsx`
  - Line 7: `const context = await requirePagePermission("SALES_INVOICE_CREATE");`
  - Line 9: renders `<PosWorkspace currency={context.company.currencyCode} userId={context.user.id} permissions={context.permissions} invoiceId={params.invoiceId} />`
  - Accepts search param `?invoiceId=...` to load an existing draft invoice for counter checkout.
- Related sales routes:
  - `/sales`: `src/app/(erp)/sales/page.tsx` renders `SalesManager`
  - `/sales/[id]/print`: `src/app/(erp)/sales/[id]/print/page.tsx` renders A4 Tax Invoice / POS Receipt
  - `/sales/[id]/receipt`: `src/app/(erp)/sales/[id]/receipt/page.tsx` renders 80mm thermal receipt

### 1.3 Barcode Scanner Input & Event Handling
- **File**: `src/components/sales/pos-workspace.tsx`
  - Lines 728-860: High-contrast console with input `ref={scanRef}`, `autoFocus`, `value={scanCode}`.
  - Line 328: `requestAnimationFrame(() => scanRef.current?.focus())` ensures auto-refocusing after scan completes and on reset (Line 514).
  - Lines 814-820 (`onKeyDown`):
    ```tsx
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
      void scan();
    }
    ```
  - Lines 771-803 (`onChange`):
    - Instant match on barcode lengths: 15 digits (IMEI), 14 (GTIN-14), 13 (EAN-13), 12 (UPC-A), 8 (EAN-8).
    - Debounce timer of 140ms on length >= 3 for barcode scanner gun burst typing.
  - Lines 298-329 (`scan` function):
    - Clears scanner input immediately (`setScanCode("")`).
    - Audio feedback: `playScanBeep(true)` (1760Hz sine wave) on success, `playScanBeep(false)` (220Hz sawtooth wave) on error using Web Audio API oscillator.
    - Resolves via `/api/operations/catalog/resolve?mode=sale&warehouseId=${warehouseId}&code=${encodeURIComponent(code)}`.
  - Resolution and Cart behavior (Lines 263-270):
    - Dual IMEI resolution: `if (cart.some((line) => line.stockUnitIds.includes(stockUnitId))) throw new Error("This physical device is already in the cart. Either IMEI resolves to the same unit.");`
    - **Grouping anomaly**: If a second physical handset of the same variant is scanned, Line 268 increments `line.quantity` and appends `stockUnitId` to the same line (`line.stockUnitIds: [...line.stockUnitIds, stockUnitId]`) instead of maintaining strict 1 physical handset = 1 individual cart line item.

### 1.4 Keyboard Shortcuts Handling
- **File**: `src/components/sales/pos-workspace.tsx` lines 584-596:
  ```tsx
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "F2") { event.preventDefault(); setSearchOpen(true); requestAnimationFrame(() => { searchRef.current?.focus(); void searchCatalog(""); }); }
      if (event.key === "F3") { event.preventDefault(); scanRef.current?.focus(); }
      if (event.key === "F4") { event.preventDefault(); customerRef.current?.focus(); }
      if (event.key === "F8") {
        event.preventDefault();
        if (cart.length > 0 && !invoice) setCart([]);
      }
      if (event.ctrlKey && event.key === "Enter") { event.preventDefault(); void createInvoice(true, true); }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [...]);
  ```
- **Shortcut status vs Requirements**:
  - `F2` Catalog Search: Implemented (opens search modal).
  - `F3` Scanner Input Focus: Implemented.
  - `F4` Customer Selection Focus: Implemented (focuses `<select>` dropdown).
  - `F6` Salesperson Selection: **MISSING** (not bound).
  - `F8` Clear Cart: Implemented (clears cart array).
  - `F9` Park Draft: **MISSING** (not bound).
  - `F10` Tender Mode / Dialog: **MISSING** (not bound).
  - `Ctrl+Enter` Quick Tender: Implemented (calls `createInvoice(true, true)`).
  - `Esc` Close Dialog: **PARTIAL** (only sets `searchOpen=false`; ignores `parkedOpen` and `creditOverrideDialog`).

### 1.5 Cart State Management, Handset vs Accessory, and Discount Handling
- **File**: `src/components/sales/pos-workspace.tsx`
  - Cart State: `const [cart, setCart] = useState<CartLine[]>([]);`
  - Serialized Handset handling:
    - Displayed with Smartphone icon and badges for each physical device (`Device #1: IMEI1 / IMEI2`).
    - Quantity editing disabled (`line.stockUnitIds.length > 0` renders a static `div` rather than `Minus`/`Plus` controls; lines 928-941).
  - Accessory / Spare Part handling:
    - Renders `Minus` and `Plus` buttons with numeric input bounded by `line.availableQuantity` (lines 932-941).
  - Price List & Floor:
    - Resolves via `/api/catalog/prices/resolve` on customer or price list change.
    - Displays minimum price floor alert in red text if unit price drops below `line.priceFloor`.
  - Discount Handling:
    - Line-level discount is supported (`line.discountAmount` input on line 952).
    - **Invoice-level discount is MISSING**: No invoice discount field exists in POS UI or totals calculation.
  - Remaining Approval Workflow Artifacts:
    - Line 1428: `<button onClick={() => void createInvoice(true, false)} ...><Send className="h-4 w-4"/>Submit for Approval</button>` is still present in the POS sidebar!
    - Lines 526-531: Credit override dialog still invokes `/api/sales/invoices/${targetInvoiceId}/approve`.

### 1.6 Customer Selection, Salesperson Selection, and Tender Dialog
- **Customer Selection**: Simple HTML `<select ref={customerRef}>` dropdown (lines 681-691). Does not provide a searchable modal or filter for large customer bases.
- **Salesperson Selection**: Simple HTML `<select>` dropdown (lines 693-696) mapping `lookups.users`.
- **Tender UI & Payments**:
  - Right sidebar pane (lines 992-1014) defines 4 mutually exclusive modes: `cash`, `card`, `wallet`, `credit`.
  - **Multi-tender split payments is MISSING**: The current architecture does not support splitting a single purchase into multiple simultaneous tenders (e.g., 50% Cash + 50% Card POS).
  - Cash mode provides denomination chips (`+500`, `+1,000`, `+5,000`, `+10,000`, `Exact`) and high-contrast change return display (lines 1280-1358).
  - Credit mode allows selecting payment due date (+7d, +15d, +30d) and down payment / advance receipt in cash drawer or bank deposit (lines 1050-1265).

### 1.7 Print Preview Components (A4 vs 80mm vs 58mm)
- **A4 Invoice Print**: `src/app/(erp)/sales/[id]/print/page.tsx`
  - High quality print layout, Code128 barcode SVG generated with `bwip-js`.
  - Approval artifacts remain: Line 37 signature block includes `Approved by`, and Line 38 footer has `"Workflow copy — subject to approval and posting."`
- **80mm Thermal Receipt**: `src/app/(erp)/sales/[id]/receipt/page.tsx`
  - Fixed 80mm width (`w-[80mm]`), monospace font, item lines, IMEIs, tax, discount, settlement method breakdown.
  - Has fatal compilation error: `invoice.branch.address` (lines 130, 132).
- **58mm Thermal Receipt**: **MISSING**. No 58mm layout or toggle exists.
- POS Post-Sale Integration: Line 1451 links only to `/sales/${invoice.id}/print` (A4). There is no thermal receipt print button on the sale completion card.

### 1.8 Shifts UI, Parked Carts UI, Returns UI, Reports UI
- **Shifts UI**: **MISSING**.
  - No `Shift` model exists in `prisma/schema.prisma`.
  - No shift opening, shift closing, cash drawer float, or reconciliation UI exists in POS or ERP.
- **Parked Carts UI**:
  - Modal exists in `pos-workspace.tsx` (lines 1559-1614) triggered by "Parked Sales" button (line 653).
  - Flaw: When clicking "Recall Sale", line 1600 executes `router.push('/sales/${inv.id}/edit')`, which redirects the user away from the POS terminal to the standard ERP invoice edit page.
  - Flaw: Does not revalidate active device custody upon recall.
  - Notice text on line 519 incorrectly states: `"Physical stock remains reserved until posted."`
- **Returns UI**:
  - Located at `/returns` (`src/app/(erp)/returns/page.tsx`, `src/components/returns/return-workspace.tsx`).
  - Separate screen from POS; still has approval workflow steps (`submit -> approve -> post`).
- **Reports UI**:
  - Located at `/reports` and `/reports/operations` (`src/components/reports/operations-report-workspace.tsx`).
  - Backed by `/api/reports/operations/route.ts` implementing 27 real database transaction reports (including sales, profitability, IMEI registry, sold IMEIs, available IMEIs, stock aging, stock by brand/model).

### 1.9 Existing Tests and Coverage for UI
- Vitest suite covers only `src/lib/` utilities and validators (`money.test.ts`, `imei.test.ts`, `validation.test.ts`, etc.).
- There are **no React Testing Library or Vitest component tests** for `PosWorkspace`, `SalesManager`, or thermal receipts.
- Existing operational test scripts (`scripts/verify-procurement-sales-acceptance.ts`) test HTTP API endpoints using node-fetch, but not browser UI rendering.

---

## 2. Logic Chain

1. **Build & Type Safety Breakage**:
   - `src/app/(erp)/sales/[id]/receipt/page.tsx` references `invoice.branch.address`.
   - `Branch` schema in `prisma/schema.prisma` has `addressLine1` and `addressLine2`, but not `address`.
   - Therefore, `npm run typecheck` fails directly on this file, preventing clean production builds.

2. **Retail Counter Speed vs Shortcut Deficiencies**:
   - High-throughput counter checkout requires standard POS retail hotkeys (`F2`, `F3`, `F4`, `F6`, `F8`, `F9`, `F10`, `Ctrl+Enter`, `Esc`).
   - Observations show `F6` (Salesperson), `F9` (Park Draft), and `F10` (Tender) are omitted from keydown listeners in `pos-workspace.tsx`.
   - `Esc` only dismisses catalog search, leaving other modals unclosable via keyboard.

3. **Approval Elimination Requirement vs UI Artifacts**:
   - The user specification strictly mandates eliminating approval workflows and statuses from POS and Sales.
   - `pos-workspace.tsx` still contains a `"Submit for Approval"` button (line 1428) and sends approval requests to `/api/sales/invoices/${id}/approve` during credit overrides (lines 526-531).
   - `SalesManager` and `SalesInvoiceWorkflowActions` still display `"Submit"`, `"Approve"`, and chained approvals.
   - A4 print template prints `"Approved by"` and `"Workflow copy — subject to approval and posting."`

4. **Multi-Tender Gap**:
   - Retail sales commonly involve mixed payments (e.g. part cash, part card or digital wallet).
   - Currently, `saleType` is a singular state string (`"cash" | "card" | "wallet" | "credit"`).
   - The tender UI cannot accept mixed payment allocations within a single transaction.

5. **Shift Management Absence**:
   - Requirement R5 mandates shift tracking (opening cash, sales, cash refunds, expected vs actual cash reconciliation).
   - Search across `prisma/schema.prisma` and UI code shows zero models, tables, APIs, or screens for shifts.

6. **Parked Cart Workflow Disruption**:
   - Recalling a held cart navigates away from the POS counter to `/sales/[id]/edit` instead of loading into POS (`/pos?invoiceId=...`).
   - This breaks counter workflow continuity for cashiers.

---

## 3. Caveats

- **No Caveats regarding exploration**: All frontend POS code, components, routes, shortcuts, print templates, and existing test configurations were completely inspected directly from source.
- Hardware peripherals (physical USB/Bluetooth barcode guns, thermal receipt ESC/POS printers) were simulated based on browser standard event flows (`keydown`, Web Audio, `@media print`).

---

## 4. Conclusion

The existing POS implementation provides a solid foundation with an auto-focusing scanner console, dual-SIM IMEI resolution, audio beeps, and rapid item resolution. However, the system requires targeted repairs and enhancements to satisfy the counter terminal specification:
1. **Fix compilation defect** in `src/app/(erp)/sales/[id]/receipt/page.tsx` (`invoice.branch.address` → `invoice.branch.addressLine1`).
2. **Complete keyboard shortcuts engine**: Add `F6` (Salesperson), `F9` (Park Draft), `F10` (Tender), and comprehensive `Esc` dialog closing.
3. **Purge all approval remnants**: Remove "Submit for Approval" button from POS, remove approval chaining from sales manager, update A4 print preview to direct-posting layout.
4. **Implement Multi-Tender Payment UI**: Replace the single `saleType` selection with a split-tender interface supporting combinations of Cash, Card POS, Mobile Wallets, and Credit with live balance reconciliation.
5. **Add 58mm Thermal Print Support**: Provide 58mm layout alongside 80mm with printer-optimized styles and direct print action buttons upon checkout completion.
6. **Implement Shift Management UI & Backend**: Build cashier shift open/close modal, expected vs actual cash count, and cash drawer report.
7. **Fix Parked Cart Retrieval**: Retain POS context upon recall (`/pos?invoiceId=...`), revalidate IMEI availability, and remove erroneous "reserved stock" notices.
8. **Enforce 1 Phone = 1 Cart Line**: Prevent grouping multiple handset IMEIs into a single variant cart line with quantity > 1.

---

## 5. Verification Method

To independently verify these findings:
1. Run typecheck to observe the receipt page compilation error:
   ```powershell
   npm run typecheck
   ```
   *Expected result*: Error in `src/app/(erp)/sales/[id]/receipt/page.tsx(130,27)`: Property 'address' does not exist on type 'Branch'.
2. Run existing Vitest unit test suite:
   ```powershell
   npm test
   ```
   *Expected result*: 11 test files passed, 63 unit tests passed (node environment, no UI tests).
3. Inspect `src/components/sales/pos-workspace.tsx`:
   - Lines 584-596: Verify absence of `F6`, `F9`, and `F10` handlers.
   - Line 1428: Verify presence of `"Submit for Approval"` button.
   - Lines 992-1014: Verify `saleType` only permits a single mode at a time.
   - Line 1600: Verify `router.push('/sales/${inv.id}/edit')` on parked sale recall.
4. Inspect `src/app/(erp)/sales/[id]/receipt/page.tsx`:
   - Line 119: Verify fixed `w-[80mm]` with no 58mm alternative.
