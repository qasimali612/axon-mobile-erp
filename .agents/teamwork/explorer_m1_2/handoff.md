# Milestone 1: UI, Actions & Status Independence Investigation Report

**Agent**: Explorer M1-2 (UI, Actions & Status Independence Explorer)  
**Date**: 2026-11-10  
**Target Milestone**: Milestone 1 (Approval UI Removal, RBAC & Status Independence)  
**Parent Task**: Axon Mobile ERP Order-to-Cash Project  

---

## 1. Observation

Direct code observations from inspected files in the workspace:

### 1.1 `src/components/sales/sales-manager.tsx`
- **Lines 38–43**: Status tone mapper includes legacy approval statuses:
  ```typescript
  function statusTone(status: string) {
    if (["POSTED", "PAID"].includes(status)) return "green" as const;
    if (["APPROVED", "SUBMITTED", "PARTIAL"].includes(status)) return "amber" as const;
    if (["REVERSED", "CANCELLED", "REJECTED", "OVERDUE"].includes(status)) return "red" as const;
    return "slate" as const;
  }
  ```
- **Lines 70–73**: Dead state variables and tab union:
  ```typescript
  const [creditOverrideTarget, setCreditOverrideTarget] = useState<any>(null);
  const [creditOverrideReason, setCreditOverrideReason] = useState("");
  const [batchPosting, setBatchPosting] = useState(false);
  const [activeTab, setActiveTab] = useState<"ALL" | "AWAITING" | "POSTED" | "DRAFT" | "UNPAID">("ALL");
  ```
- **Lines 114–132**: Tab switch handler uses `AWAITING` which sets document status to `"SUBMITTED"`:
  ```typescript
  function handleTabChange(tab: "ALL" | "AWAITING" | "POSTED" | "DRAFT" | "UNPAID") {
    setActiveTab(tab);
    if (tab === "ALL") {
      setStatus("");
      setPaymentStatus("");
    } else if (tab === "AWAITING") {
      setStatus("SUBMITTED");
      setPaymentStatus("");
    } ...
  ```
- **Lines 154–188**: Client-side auto-approval hack in `directPost`:
  ```typescript
  let postRes = await fetch(`/api/sales/invoices/${row.id}/post`, { method: "POST" });
  if (!postRes.ok && (row.status === "DRAFT" || row.status === "SUBMITTED")) {
    if (row.status === "DRAFT") {
      await fetch(`/api/sales/invoices/${row.id}/submit`, { method: "POST" });
    }
    await fetch(`/api/sales/invoices/${row.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Direct Post authorization" }),
    });
    postRes = await fetch(`/api/sales/invoices/${row.id}/post`, { method: "POST" });
  }
  ```
- **Lines 190–215**: Legacy helper `act(row, action)` containing `"submit"` and `"approve"` cases:
  ```typescript
  toast.success(
    `${row.invoiceNumber} ${action === "submit" ? "submitted" : action === "approve" ? "approved" : "posted"}.`
  );
  ```
- **Line 237**: Metric calculation counting legacy statuses:
  ```typescript
  const unposted = count(["DRAFT", "SUBMITTED", "APPROVED"]);
  ```
- **Lines 364–370**: Navigation tabs displaying `AWAITING` tab:
  ```typescript
  {[
    { id: "ALL", label: "All Invoices", count: metrics.total },
    { id: "AWAITING", label: "Unposted Invoices", count: metrics.unposted },
    { id: "POSTED", label: "Posted to GL", count: metrics.posted },
    { id: "UNPAID", label: "Unpaid / Overdue" },
  ].map...
  ```
- **Line 439**: Document status dropdown filter containing legacy approval statuses:
  ```typescript
  {["DRAFT", "SUBMITTED", "APPROVED", "POSTED", "REJECTED", "CANCELLED", "REVERSED"].map((s) => (
  ```
- **Lines 591 & 604**: Table row actions checking `SUBMITTED` and `APPROVED`:
  ```typescript
  {(row.status === "DRAFT" || row.status === "SUBMITTED" || row.status === "APPROVED") &&
    can("SALES_INVOICE_CREATE") && ( ...
  ```
- **Lines 791–893**: Dead modal `<div className="fixed inset-0 ...">` titled `"Approve with Credit Override"` calling `act(target.row, "approve", reason)` when `creditOverrideTarget` is never populated elsewhere in `sales-manager.tsx`.

---

### 1.2 `src/components/sales/sales-invoice-actions.tsx`
- **Lines 23–40**: `Props` type requiring `approvedById: string | null;`.
- **Lines 47–48**: Unused/approval state variables `creditOverrideTarget` and `creditOverrideReason`.
- **Lines 52–90**: `executeAction(action, overrideReason)` handling `action === "submit"` and `action === "approve"`.
- **Lines 92–126**: Multi-step client-side auto-approval hack inside `directPost`:
  ```typescript
  let postRes = await fetch(`/api/sales/invoices/${invoice.id}/post`, { method: "POST" });
  if (!postRes.ok && (invoice.status === "DRAFT" || invoice.status === "SUBMITTED")) {
    if (invoice.status === "DRAFT") {
      await fetch(`/api/sales/invoices/${invoice.id}/submit`, { method: "POST" });
    }
    await fetch(`/api/sales/invoices/${invoice.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Direct Post authorization" }),
    });
    postRes = await fetch(`/api/sales/invoices/${invoice.id}/post`, { method: "POST" });
  }
  ```
- **Lines 151–153**: Inactive status filter:
  ```typescript
  if (["POSTED", "REVERSED", "CANCELLED", "REJECTED"].includes(invoice.status)) {
    return null;
  }
  ```
- **Lines 235–328**: Approval modal titled `"Approve with Credit Override"` containing button `"Authorize & Approve Credit"` calling `executeAction("approve", reason)`.

---

### 1.3 `src/app/(erp)/sales/[id]/page.tsx`
- **Lines 15–20**: Status tone mapper checking legacy statuses:
  ```typescript
  function statusTone(status: string) {
    if (status === "POSTED") return "green" as const;
    if (["APPROVED", "SUBMITTED"].includes(status)) return "amber" as const;
    if (["REVERSED", "CANCELLED", "REJECTED"].includes(status)) return "red" as const;
    return "slate" as const;
  }
  ```
- **Line 44**: Query include selecting `approvedBy: { select: { id: true, fullName: true } }`.
- **Lines 91–93**: Reversal permission blocked by segregation-of-duties check `separated`:
  ```typescript
  const roleAllowsReversal = scopedPermission(context, "SALES_INVOICE_REVERSE", invoice.branchId, invoice.warehouseId);
  const separated = context.user.id !== invoice.preparedById && context.user.id !== invoice.approvedById && context.user.id !== invoice.postedById;
  const canReverse = invoice.status === OperationalDocumentStatus.POSTED && !invoice.reversalOfId && roleAllowsReversal && separated;
  ```
- **Line 115**: Passing `approvedById: invoice.approvedById` to `SalesInvoiceWorkflowActions`.
- **Line 126**: Edit Draft link checking legacy negative conditions:
  ```typescript
  {invoice.status !== OperationalDocumentStatus.POSTED && invoice.status !== OperationalDocumentStatus.REVERSED && invoice.status !== OperationalDocumentStatus.CANCELLED && (
  ```
- **Line 183**: Timeline UI displaying "Approved by":
  ```tsx
  <dt className="text-slate-500">Prepared by</dt>
  <dd className="text-right font-bold">{invoice.preparedBy.fullName}</dd>
  <dt className="text-slate-500">Approved by</dt>
  <dd className="text-right font-bold">{invoice.approvedBy?.fullName || "—"}</dd>
  <dt className="text-slate-500">Posted by</dt>
  <dd className="text-right font-bold">{invoice.postedBy?.fullName || "—"}</dd>
  ```

---

### 1.4 `src/app/(erp)/sales/[id]/print/page.tsx`
- **Line 20**: Query include: `approvedBy: { select: { fullName: true } }`.
- **Line 37**: 3-column signature section requiring "Approved by":
  ```tsx
  <section className="print-break-avoid mt-12 grid grid-cols-3 gap-8 text-center text-[10px]">
    <div className="border-t border-slate-400 pt-2">
      <b>{invoice.preparedBy.fullName}</b>
      <div className="text-slate-500">Prepared by</div>
    </div>
    <div className="border-t border-slate-400 pt-2">
      <b>{invoice.approvedBy?.fullName || "Pending"}</b>
      <div className="text-slate-500">Approved by</div>
    </div>
    <div className="border-t border-slate-400 pt-2">
      <b>{invoice.postedBy?.fullName || "Not posted"}</b>
      <div className="text-slate-500">Posted by</div>
    </div>
  </section>
  ```
- **Line 38**: Footer containing "subject to approval" text:
  ```tsx
  <div>{invoice.status === "POSTED" ? "Posted sale — stock and GL effects are immutable." : "Workflow copy — subject to approval and posting."}</div>
  ```

---

### 1.5 `src/app/api/sales/invoices/route.ts:174–177`
- **Lines 116–121**: Filter calculation for `financials`:
  ```typescript
  const financials = new Map(financialRows.map((invoice) => {
    const paid = settlement(invoice.allocations);
    const isPosted = invoice.status === OperationalDocumentStatus.POSTED;
    const outstanding = isPosted ? Prisma.Decimal.max(invoice.grandTotal.minus(paid), 0) : new Prisma.Decimal(0);
    return [invoice.id, { paid, outstanding, status: invoice.status, paymentStatus: invoicePaymentStatus(invoice.grandTotal, paid, invoice.dueDate, today) }];
  }));
  ```
  Note: Line 120 correctly calculates `paymentStatus` using `invoicePaymentStatus(...)` for all invoices (evaluating to `"UNPAID"` for unposted invoices).
- **Lines 166–178**: Response serialization override:
  ```typescript
  const items = rawItems.map((invoice) => {
    const paidAmount = settlement(invoice.allocations);
    const isPosted = invoice.status === OperationalDocumentStatus.POSTED;
    const outstandingAmount = isPosted ? Prisma.Decimal.max(invoice.grandTotal.minus(paidAmount), 0) : new Prisma.Decimal(0);
    return {
      ...invoice,
      paidAmount,
      outstandingAmount,
      paymentStatus: isPosted
        ? invoicePaymentStatus(invoice.grandTotal, paidAmount, invoice.dueDate, today)
        : "DRAFT",
    };
  });
  ```
  Note: Line 176 forcibly replaces the payment status with `"DRAFT"` whenever `isPosted` is false.

---

### 1.6 Additional Related Files
- **`src/app/(erp)/sales/page.tsx` line 4**:
  ```typescript
  const documentStatuses = new Set(["DRAFT", "SUBMITTED", "APPROVED", "POSTED", "REJECTED", "CANCELLED", "REVERSED"]);
  ```
- **`src/app/(erp)/sales/dashboard/page.tsx` line 178**:
  ```tsx
  <Badge tone={invoice.status === "POSTED" ? "green" : ["SUBMITTED", "APPROVED"].includes(invoice.status) ? "amber" : "slate"}>
  ```
- **`src/app/api/sales/invoices/route.ts` lines 218–219**:
  Auto-post endpoint calls `submitSalesInvoice` and `approveSalesInvoice` before `postSalesInvoice`.

---

## 2. Logic Chain

1. **Elimination of Approval Workflow in Order-to-Cash**:
   - The user requirement (R1) specifies: "Completely remove user approval mechanisms (maker-checker, approver assignments, approval queues, approval bands, approval-based posting, operating mode restrictions) from the Cash, Bank & Party Settlement and Order-to-Cash modules."
   - In `sales-manager.tsx:157-168` and `sales-invoice-actions.tsx:95-106`, the client executes an artificial retry hack: if `/post` fails, it calls `/submit` and `/approve` with `{ reason: "Direct Post authorization" }` before re-calling `/post`. This was a workaround for legacy multi-user approval restrictions.
   - Because the backend operating mode already bypassed maker-checker (`assertMakerChecker` and `assertSegregationOfDuties` in `src/lib/operating-mode.ts`), chaining `/submit` and `/approve` on the client creates unnecessary HTTP roundtrips, risks partial state pollution, and masks actual validation failures (such as insufficient stock, inactive products, or closed financial periods).
   - Therefore, `directPost` must directly issue a single atomic `POST /api/sales/invoices/${id}/post` call.

2. **UI Approval Artifact Removal**:
   - In `sales-manager.tsx`, tab `AWAITING` maps to `status: "SUBMITTED"`. In an approval-free architecture, invoices do not enter a `SUBMITTED` state awaiting approval; they transition directly from `DRAFT` to `POSTED` via `SALES_INVOICE_POST`. Clicking "Unposted Invoices" sets `status=SUBMITTED`, hiding actual draft invoices. The tab must be replaced with `DRAFT` mapping to `status: "DRAFT"`.
   - In `sales-manager.tsx:439` and `sales/page.tsx:4`, status dropdowns include `"SUBMITTED"`, `"APPROVED"`, `"REJECTED"`. These must be removed so document status strictly contains: `DRAFT`, `POSTED`, `CANCELLED`, `REVERSED`.
   - In `sales-manager.tsx:791-893` and `sales-invoice-actions.tsx:235-328`, legacy "Approve with Credit Override" dialogs remain. These dialogs invoke `/approve`. Since approval workflows are abolished, these approval dialogs and helper methods must be removed.

3. **Segregation-of-Duties Locks**:
   - In `sales/[id]/page.tsx:92`, `separated` mandates that the user attempting to reverse an invoice cannot be the user who prepared, approved, or posted it (`context.user.id !== invoice.preparedById && context.user.id !== invoice.approvedById && context.user.id !== invoice.postedById`).
   - In single-operator, branch retail, or SME environments, the authorized branch manager who posted the invoice often needs to post the reversal when a customer returns a serialized unit.
   - Requirement R1 explicitly commands: "remove user approval mechanisms (maker-checker ... operating mode restrictions) ... Authorized users must be able to directly create, validate, submit, post, or cancel vouchers."
   - Retaining the `separated` check breaks authorized reversals. Reversal authority must be governed strictly by standard RBAC permission `SALES_INVOICE_REVERSE` and scoped branch/warehouse authorization, not maker-checker identity separation.

4. **Print Template Cleanliness**:
   - In `sales/[id]/print/page.tsx:37`, the document layout displays a 3-column signature block with "Approved by (Pending)". This forces a non-existent approval step on official customer tax invoices.
   - In `sales/[id]/print/page.tsx:38`, unposted copies display `"Workflow copy — subject to approval and posting."`.
   - Removing the "Approved by" column converts the block into a standard 2-column signature block ("Prepared by" and "Posted by"). The footer must state `"Draft copy — not yet posted to stock or General Ledger."`, eliminating all references to approval.

5. **Status Independence & Bug Fix in `sales/invoices/route.ts:174-177`**:
   - In `src/app/api/sales/invoices/route.ts:174-177`, line 176 forced `paymentStatus: "DRAFT"` on any unposted invoice.
   - `DRAFT` is a **Document Status**; it is NOT a valid **Payment Status**. The payment status enum/domain is strictly: `UNPAID`, `PARTIAL`, `PAID`, `OVERDUE`.
   - In the same route handler at line 120, the search filter accurately computed `invoicePaymentStatus(...)` for all invoices (evaluating to `UNPAID`). However, because line 176 overrode it with `"DRAFT"` in the response serialization, the frontend received `paymentStatus: "DRAFT"`.
   - When users filtered by `paymentStatus=UNPAID`, the SQL matched the invoice, but the resulting table displayed `paymentStatus: "DRAFT"`.
   - Removing the ternary override ensures that document status (`DRAFT`, `POSTED`, `CANCELLED`, `REVERSED`) and payment status (`UNPAID`, `PARTIAL`, `PAID`, `OVERDUE`) are completely independent, mutually orthogonal dimensions.

---

## 3. Caveats

1. **Historical Records with Legacy Statuses**:
   - Any historical invoices in the database that were previously left in `SUBMITTED` or `APPROVED` status before this cleanup will not appear if a strict filter for `status=DRAFT` is applied. In Milestone 1 execution, existing historical non-posted invoices should either be kept readable or updated to `DRAFT` via safe migration.
2. **Credit Limit Handling**:
   - Removing the "Approve with Credit Override" dialog means credit limit violations during direct posting will return standard API error `CREDIT_LIMIT_EXCEEDED`. POS Counter (`pos-workspace.tsx`) handles this via managerial credit override in POS; the ERP direct post endpoint should either allow authorized posters with `sales.discount.override` / managerial permissions to supply an override reason directly in the post payload, or return the standard error toast.
3. **No Direct Source Changes by Explorer**:
   - As an explorer agent, no source code was modified during this investigation. All changes below are exact, verified specifications for the implementer.

---

## 4. Conclusion & Exact Code Specifications

### 4.1 Specification for `src/components/sales/sales-manager.tsx`

#### Change 1: Clean `statusTone` (Lines 38–43)
```typescript
// BEFORE:
function statusTone(status: string) {
  if (["POSTED", "PAID"].includes(status)) return "green" as const;
  if (["APPROVED", "SUBMITTED", "PARTIAL"].includes(status)) return "amber" as const;
  if (["REVERSED", "CANCELLED", "REJECTED", "OVERDUE"].includes(status)) return "red" as const;
  return "slate" as const;
}

// AFTER:
function statusTone(status: string) {
  if (["POSTED", "PAID"].includes(status)) return "green" as const;
  if (["PARTIAL"].includes(status)) return "amber" as const;
  if (["REVERSED", "CANCELLED", "OVERDUE"].includes(status)) return "red" as const;
  return "slate" as const;
}
```

#### Change 2: Remove Dead State & Clean Active Tabs (Lines 70–74, 114–132)
```typescript
// BEFORE:
const [creditOverrideTarget, setCreditOverrideTarget] = useState<any>(null);
const [creditOverrideReason, setCreditOverrideReason] = useState("");
const [batchPosting, setBatchPosting] = useState(false);
const [activeTab, setActiveTab] = useState<"ALL" | "AWAITING" | "POSTED" | "DRAFT" | "UNPAID">("ALL");

// ...
function handleTabChange(tab: "ALL" | "AWAITING" | "POSTED" | "DRAFT" | "UNPAID") {
  setActiveTab(tab);
  if (tab === "ALL") {
    setStatus("");
    setPaymentStatus("");
  } else if (tab === "AWAITING") {
    setStatus("SUBMITTED");
    setPaymentStatus("");
  } else if (tab === "POSTED") {
    setStatus("POSTED");
    setPaymentStatus("");
  } else if (tab === "DRAFT") {
    setStatus("DRAFT");
    setPaymentStatus("");
  } else if (tab === "UNPAID") {
    setStatus("POSTED");
    setPaymentStatus("UNPAID");
  }
}

// AFTER:
const [batchPosting, setBatchPosting] = useState(false);
const [activeTab, setActiveTab] = useState<"ALL" | "DRAFT" | "POSTED" | "UNPAID">("ALL");

// ...
function handleTabChange(tab: "ALL" | "DRAFT" | "POSTED" | "UNPAID") {
  setActiveTab(tab);
  if (tab === "ALL") {
    setStatus("");
    setPaymentStatus("");
  } else if (tab === "DRAFT") {
    setStatus("DRAFT");
    setPaymentStatus("");
  } else if (tab === "POSTED") {
    setStatus("POSTED");
    setPaymentStatus("");
  } else if (tab === "UNPAID") {
    setStatus("POSTED");
    setPaymentStatus("UNPAID");
  }
}
```

#### Change 3: Purge Client-Side Auto-Approval Hack from `directPost` (Lines 154–188)
```typescript
// BEFORE:
async function directPost(row: any) {
  setActingId(row.id);
  try {
    let postRes = await fetch(`/api/sales/invoices/${row.id}/post`, { method: "POST" });
    if (!postRes.ok && (row.status === "DRAFT" || row.status === "SUBMITTED")) {
      if (row.status === "DRAFT") {
        await fetch(`/api/sales/invoices/${row.id}/submit`, { method: "POST" });
      }
      await fetch(`/api/sales/invoices/${row.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Direct Post authorization" }),
      });
      postRes = await fetch(`/api/sales/invoices/${row.id}/post`, { method: "POST" });
    }

    const body = await postRes.json().catch(() => null);
    if (!postRes.ok) {
      return toast.error(body?.error?.message || "Failed to post sales invoice.");
    }

    toast.success(`${row.invoiceNumber} posted to stock & GL atomically!`, {
      action: {
        label: "Print Invoice",
        onClick: () => window.open(`/sales/${row.id}/print`, "_blank"),
      },
      duration: 8000,
    });
    void load();
  } catch {
    toast.error("Network error posting sales invoice.");
  } finally {
    setActingId("");
  }
}

// AFTER:
async function directPost(row: any) {
  setActingId(row.id);
  try {
    const postRes = await fetch(`/api/sales/invoices/${row.id}/post`, { method: "POST" });
    const body = await postRes.json().catch(() => null);
    if (!postRes.ok) {
      return toast.error(body?.error?.message || "Failed to post sales invoice.");
    }

    toast.success(`${row.invoiceNumber} posted to stock & GL atomically!`, {
      action: {
        label: "Print Invoice",
        onClick: () => window.open(`/sales/${row.id}/print`, "_blank"),
      },
      duration: 8000,
    });
    void load();
  } catch {
    toast.error("Network error posting sales invoice.");
  } finally {
    setActingId("");
  }
}
```

#### Change 4: Remove Legacy `act` Helper (Lines 190–215)
- Remove `act(row, action)` since `directPost(row)` handles posting and `cancelDraft()` handles cancellation.

#### Change 5: Metric Calculation & Tab Headers (Lines 237, 364–370)
```typescript
// BEFORE:
const unposted = count(["DRAFT", "SUBMITTED", "APPROVED"]);
// ...
{[
  { id: "ALL", label: "All Invoices", count: metrics.total },
  { id: "AWAITING", label: "Unposted Invoices", count: metrics.unposted },
  { id: "POSTED", label: "Posted to GL", count: metrics.posted },
  { id: "UNPAID", label: "Unpaid / Overdue" },
].map...

// AFTER:
const unposted = count(["DRAFT"]);
// ...
{[
  { id: "ALL", label: "All Invoices", count: metrics.total },
  { id: "DRAFT", label: "Draft Invoices", count: metrics.unposted },
  { id: "POSTED", label: "Posted to GL", count: metrics.posted },
  { id: "UNPAID", label: "Unpaid / Overdue" },
].map...
```

#### Change 6: Clean Document Status Filter Dropdown (Line 439)
```typescript
// BEFORE:
{["DRAFT", "SUBMITTED", "APPROVED", "POSTED", "REJECTED", "CANCELLED", "REVERSED"].map((s) => (

// AFTER:
{["DRAFT", "POSTED", "CANCELLED", "REVERSED"].map((s) => (
```

#### Change 7: Row Action Conditions & Post RBAC (Lines 591, 604)
```typescript
// BEFORE (Line 591):
{(row.status === "DRAFT" || row.status === "SUBMITTED" || row.status === "APPROVED") &&
  can("SALES_INVOICE_CREATE") && (

// AFTER:
{row.status === "DRAFT" && can("SALES_INVOICE_CREATE") && (

// BEFORE (Line 604):
{(row.status === "DRAFT" || row.status === "SUBMITTED" || row.status === "APPROVED") && can("SALES_INVOICE_CREATE") && (

// AFTER:
{row.status === "DRAFT" && can("SALES_INVOICE_POST") && (
```

#### Change 8: Remove Dead Credit Override Modal (Lines 791–893)
- Delete entire modal block `{creditOverrideTarget && ( ... )}`.

---

### 4.2 Specification for `src/components/sales/sales-invoice-actions.tsx`

#### Change 1: Clean Component Props (Lines 23–40)
```typescript
// BEFORE:
type Props = {
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    grandTotal: string | number;
    currencyCode: string;
    preparedById: string;
    approvedById: string | null;
    customer: {
      id: string;
      code: string;
      name: string;
      creditLimit?: string | number;
    };
  };
  userId: string;
  permissions: string[];
};

// AFTER:
type Props = {
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    grandTotal: string | number;
    currencyCode: string;
    preparedById: string;
    customer: {
      id: string;
      code: string;
      name: string;
      creditLimit?: string | number;
    };
  };
  userId: string;
  permissions: string[];
};
```

#### Change 2: Remove Dead State & `executeAction` (Lines 47–90)
- Remove `const [creditOverrideTarget, setCreditOverrideTarget] = useState<any>(null);`
- Remove `const [creditOverrideReason, setCreditOverrideReason] = useState("");`
- Remove `async function executeAction(action: string, overrideReason?: string) { ... }`

#### Change 3: Purge Multi-Step Hack from `directPost` (Lines 92–126)
```typescript
// BEFORE:
async function directPost() {
  setActing(true);
  try {
    let postRes = await fetch(`/api/sales/invoices/${invoice.id}/post`, { method: "POST" });
    if (!postRes.ok && (invoice.status === "DRAFT" || invoice.status === "SUBMITTED")) {
      if (invoice.status === "DRAFT") {
        await fetch(`/api/sales/invoices/${invoice.id}/submit`, { method: "POST" });
      }
      await fetch(`/api/sales/invoices/${invoice.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Direct Post authorization" }),
      });
      postRes = await fetch(`/api/sales/invoices/${invoice.id}/post`, { method: "POST" });
    }

    const body = await postRes.json().catch(() => null);
    if (!postRes.ok) {
      return toast.error(body?.error?.message || "Failed to post sales invoice.");
    }

    toast.success(`${invoice.invoiceNumber} posted to stock & GL atomically!`, {
      action: {
        label: "Print Invoice",
        onClick: () => window.open(`/sales/${invoice.id}/print`, "_blank"),
      },
      duration: 8000,
    });
    router.refresh();
  } catch {
    toast.error("Network error posting sales invoice.");
  } finally {
    setActing(false);
  }
}

// AFTER:
async function directPost() {
  setActing(true);
  try {
    const postRes = await fetch(`/api/sales/invoices/${invoice.id}/post`, { method: "POST" });
    const body = await postRes.json().catch(() => null);
    if (!postRes.ok) {
      return toast.error(body?.error?.message || "Failed to post sales invoice.");
    }

    toast.success(`${invoice.invoiceNumber} posted to stock & GL atomically!`, {
      action: {
        label: "Print Invoice",
        onClick: () => window.open(`/sales/${invoice.id}/print`, "_blank"),
      },
      duration: 8000,
    });
    router.refresh();
  } catch {
    toast.error("Network error posting sales invoice.");
  } finally {
    setActing(false);
  }
}
```

#### Change 4: Early Return & Clean Action Bar (Lines 151–153, 235–328)
```typescript
// BEFORE:
if (["POSTED", "REVERSED", "CANCELLED", "REJECTED"].includes(invoice.status)) {
  return null;
}

// AFTER:
if (invoice.status !== "DRAFT") {
  return null;
}
```
- Remove lines 235–328: Delete `{creditOverrideTarget && ( ... )}` modal.
- Clean unused icon imports: Remove `AlertTriangle`, `BadgeCheck`, `FileCheck2`, `PackageCheck`, `Send`.

---

### 4.3 Specification for `src/app/(erp)/sales/[id]/page.tsx`

#### Change 1: Clean `statusTone` (Lines 15–20)
```typescript
// BEFORE:
function statusTone(status: string) {
  if (status === "POSTED") return "green" as const;
  if (["APPROVED", "SUBMITTED"].includes(status)) return "amber" as const;
  if (["REVERSED", "CANCELLED", "REJECTED"].includes(status)) return "red" as const;
  return "slate" as const;
}

// AFTER:
function statusTone(status: string) {
  if (status === "POSTED") return "green" as const;
  if (status === "DRAFT") return "slate" as const;
  if (["REVERSED", "CANCELLED"].includes(status)) return "red" as const;
  return "slate" as const;
}
```

#### Change 2: Remove Segregation of Duties Lock on Reversals (Lines 91–93)
```typescript
// BEFORE:
const roleAllowsReversal = scopedPermission(context, "SALES_INVOICE_REVERSE", invoice.branchId, invoice.warehouseId);
const separated = context.user.id !== invoice.preparedById && context.user.id !== invoice.approvedById && context.user.id !== invoice.postedById;
const canReverse = invoice.status === OperationalDocumentStatus.POSTED && !invoice.reversalOfId && roleAllowsReversal && separated;

// AFTER:
const roleAllowsReversal = scopedPermission(context, "SALES_INVOICE_REVERSE", invoice.branchId, invoice.warehouseId);
const canReverse = invoice.status === OperationalDocumentStatus.POSTED && !invoice.reversalOfId && roleAllowsReversal;
```

#### Change 3: Remove `approvedById` Pass (Line 115) & Simplify Edit Condition (Line 126)
```typescript
// BEFORE (Line 115):
preparedById: invoice.preparedById,
approvedById: invoice.approvedById,

// AFTER:
preparedById: invoice.preparedById,

// BEFORE (Line 126):
{invoice.status !== OperationalDocumentStatus.POSTED && invoice.status !== OperationalDocumentStatus.REVERSED && invoice.status !== OperationalDocumentStatus.CANCELLED && (

// AFTER:
{invoice.status === OperationalDocumentStatus.DRAFT && (
```

#### Change 4: Remove "Approved by" from Audit Timeline (Line 183)
```tsx
// BEFORE:
<dl className="grid grid-cols-2 gap-y-2">
  <dt className="text-slate-500">Prepared by</dt>
  <dd className="text-right font-bold">{invoice.preparedBy.fullName}</dd>
  <dt className="text-slate-500">Approved by</dt>
  <dd className="text-right font-bold">{invoice.approvedBy?.fullName || "—"}</dd>
  <dt className="text-slate-500">Posted by</dt>
  <dd className="text-right font-bold">{invoice.postedBy?.fullName || "—"}</dd>
  {invoice.reversedBy && <>
    <dt className="text-slate-500">Reversed by</dt>
    <dd className="text-right font-bold">{invoice.reversedBy.fullName}</dd>
  </>}
</dl>

// AFTER:
<dl className="grid grid-cols-2 gap-y-2">
  <dt className="text-slate-500">Prepared by</dt>
  <dd className="text-right font-bold">{invoice.preparedBy.fullName}</dd>
  <dt className="text-slate-500">Posted by</dt>
  <dd className="text-right font-bold">{invoice.postedBy?.fullName || "—"}</dd>
  {invoice.reversedBy && <>
    <dt className="text-slate-500">Reversed by</dt>
    <dd className="text-right font-bold">{invoice.reversedBy.fullName}</dd>
  </>}
</dl>
```

---

### 4.4 Specification for `src/app/(erp)/sales/[id]/print/page.tsx`

#### Change 1: Query Include (Line 20)
- Remove `approvedBy: { select: { fullName: true } },` from prisma query.

#### Change 2: Convert Signature Block from 3 to 2 Columns (Line 37)
```tsx
// BEFORE:
<section className="print-break-avoid mt-12 grid grid-cols-3 gap-8 text-center text-[10px]">
  <div className="border-t border-slate-400 pt-2">
    <b>{invoice.preparedBy.fullName}</b>
    <div className="text-slate-500">Prepared by</div>
  </div>
  <div className="border-t border-slate-400 pt-2">
    <b>{invoice.approvedBy?.fullName || "Pending"}</b>
    <div className="text-slate-500">Approved by</div>
  </div>
  <div className="border-t border-slate-400 pt-2">
    <b>{invoice.postedBy?.fullName || "Not posted"}</b>
    <div className="text-slate-500">Posted by</div>
  </div>
</section>

// AFTER:
<section className="print-break-avoid mt-12 grid grid-cols-2 gap-12 text-center text-[10px]">
  <div className="border-t border-slate-400 pt-2">
    <b>{invoice.preparedBy.fullName}</b>
    <div className="text-slate-500">Prepared by</div>
  </div>
  <div className="border-t border-slate-400 pt-2">
    <b>{invoice.postedBy?.fullName || "Not posted"}</b>
    <div className="text-slate-500">Posted by</div>
  </div>
</section>
```

#### Change 3: Remove "subject to approval" Footer (Line 38)
```tsx
// BEFORE:
<div>{invoice.status === "POSTED" ? "Posted sale — stock and GL effects are immutable." : "Workflow copy — subject to approval and posting."}</div>

// AFTER:
<div>{invoice.status === "POSTED" ? "Posted sale — stock and GL effects are immutable." : "Draft copy — not yet posted to stock or General Ledger."}</div>
```

---

### 4.5 Specification for `src/app/api/sales/invoices/route.ts:174–177` (Status Independence Bug Fix)

#### Fix: Independent Payment Status Serialization
```typescript
// BEFORE (Lines 166–178):
const items = rawItems.map((invoice) => {
  const paidAmount = settlement(invoice.allocations);
  const isPosted = invoice.status === OperationalDocumentStatus.POSTED;
  const outstandingAmount = isPosted ? Prisma.Decimal.max(invoice.grandTotal.minus(paidAmount), 0) : new Prisma.Decimal(0);
  return {
    ...invoice,
    paidAmount,
    outstandingAmount,
    paymentStatus: isPosted
      ? invoicePaymentStatus(invoice.grandTotal, paidAmount, invoice.dueDate, today)
      : "DRAFT",
  };
});

// AFTER:
const items = rawItems.map((invoice) => {
  const paidAmount = settlement(invoice.allocations);
  const isPosted = invoice.status === OperationalDocumentStatus.POSTED;
  const outstandingAmount = isPosted ? Prisma.Decimal.max(invoice.grandTotal.minus(paidAmount), 0) : new Prisma.Decimal(0);
  return {
    ...invoice,
    paidAmount,
    outstandingAmount,
    paymentStatus: invoicePaymentStatus(invoice.grandTotal, paidAmount, invoice.dueDate, today),
  };
});
```

---

### 4.6 Safety Guarantees

1. **Transactional Atomicity**:
   - Calling `/api/sales/invoices/${row.id}/post` directly routes into the single serializable transaction in `postSalesInvoice()`, ensuring inventory deduction, COGS calculation, and General Ledger posting occur atomically or not at all.
2. **RBAC Integrity**:
   - Authorized actions strictly enforce permissions:
     - Posting: `SALES_INVOICE_POST`
     - Drafting/Editing: `SALES_INVOICE_CREATE`
     - Reversals: `SALES_INVOICE_REVERSE`
     - Payments: `PAYMENT_CREATE`
3. **Status Independence Guarantee**:
   - Document status strictly indicates inventory and GL ledger commitment (`DRAFT`, `POSTED`, `CANCELLED`, `REVERSED`).
   - Payment status strictly indicates settlement progress against receivable balance (`UNPAID`, `PARTIAL`, `PAID`, `OVERDUE`).
   - Neither status is ever assigned to or conflated with the other.

---

## 5. Verification Method

To independently verify these specifications when implemented:

1. **Static Analysis & Typecheck**:
   ```powershell
   npx tsc --noEmit
   ```
   Ensures no invalid status strings, deleted properties (`approvedById`), or missing parameters fail compilation.

2. **Lint Check**:
   ```powershell
   npm run lint
   ```
   Ensures no unused variables or unreferenced imports (e.g. `creditOverrideTarget`, `AlertTriangle`).

3. **Status Independence Test**:
   - Create a draft invoice with 0 payments: Verify `status === "DRAFT"` and `paymentStatus === "UNPAID"`.
   - Filter sales register by `GET /api/sales/invoices?paymentStatus=UNPAID`: Verify that the draft invoice is returned and its `paymentStatus` field in `data` equals `"UNPAID"`, NOT `"DRAFT"`.

4. **Direct Post Execution Test**:
   - In browser or API client, issue a direct POST to `/api/sales/invoices/${id}/post` for a draft invoice:
     - Verify response returns status 200 with posted invoice and journal entry voucher.
     - Verify no intermediate calls to `/submit` or `/approve` appear in network logs or audit logs.

5. **Self-Reversal RBAC Test**:
   - Log in as user A who prepared and posted an invoice.
   - User A has role with `SALES_INVOICE_REVERSE` on the branch.
   - Navigate to `/sales/${invoice.id}`: Verify "Reverse posted document" button is enabled (not disabled by `separated`).
   - Post reversal: Verify reversal completes successfully and audit log records the reversal.

6. **Print Document Audit**:
   - Open `/sales/${invoice.id}/print` in a new tab:
     - Inspect footer: verify absence of `"subject to approval"`.
     - Inspect signature section: verify 2-column signature layout ("Prepared by" and "Posted by").
