import { ApiError, apiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { getPartyStatement, parseLedgerDate, type PartyLedgerKind } from "@/lib/finance/subledger";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ kind: string; id: string }> };
function kindValue(value: string): PartyLedgerKind { if (value === "customer" || value === "supplier") return value; throw new ApiError(404, "LEDGER_NOT_FOUND", "Party ledger type was not found."); }
function csvCell(value: unknown) { const text = String(value ?? ""); const safe = /^[=+\-@]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; }

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const route = await params;
    const kind = kindValue(route.kind);
    const id = idSchema.parse(route.id);
    const permission = kind === "customer" ? "CUSTOMER_LEDGER_VIEW" : "SUPPLIER_LEDGER_VIEW";
    const context = await requirePermission(permission);
    const query = new URL(request.url).searchParams;
    const allowedBranches = permittedBranchIds(context, permission);
    const requestedBranchId = query.get("branchId") || null;
    if (requestedBranchId && allowedBranches && !allowedBranches.includes(requestedBranchId)) throw new ApiError(403, "BRANCH_SCOPE_FORBIDDEN", "You cannot view this branch ledger.");
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const defaultFrom = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    const from = parseLedgerDate(query.get("from"), "From date", defaultFrom);
    const to = parseLedgerDate(query.get("to"), "To date", today);
    const report = await getPartyStatement({ companyId: context.company.id, kind, partyId: id, from, to, branchIds: requestedBranchId ? [requestedBranchId] : allowedBranches });
    if (query.get("format") === "csv") {
      const rows: unknown[][] = [
        [`${kind === "customer" ? "Customer" : "Supplier"} statement`, report.party.code, report.party.name],
        ["From", from.toISOString().slice(0, 10), "To", to.toISOString().slice(0, 10)],
        [],
        ["Date", "Voucher", "Source", "Reference", "Branch", "Description", "Debit", "Credit", "Running balance"],
        [from.toISOString().slice(0, 10), "OPENING", "", "", "", "Opening balance", "", "", report.openingBalance.toFixed(4)],
        ...report.transactions.map((row) => [row.postingDate.toISOString().slice(0, 10), row.voucherNumber, row.sourceDocumentType || row.sourceModule, row.sourceDocumentNumber || row.reference || "", row.branch.code, row.description, row.debit.toFixed(4), row.credit.toFixed(4), row.runningBalance.toFixed(4)]),
        [],
        ["Open document", "Document date", "Due date", "Original", "Returns", "Allocated", "Open", "Days past due"],
        ...report.openItems.map((item) => [item.number, item.documentDate.toISOString().slice(0, 10), item.dueDate.toISOString().slice(0, 10), item.originalAmount.toFixed(4), item.returnsAmount.toFixed(4), item.allocatedAmount.toFixed(4), item.openAmount.toFixed(4), item.daysPastDue]),
      ];
      const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
      await appendAudit({ companyId: context.company.id, actorId: context.user.id, branchId: requestedBranchId, action: `${kind.toUpperCase()}_STATEMENT_EXPORTED`, module: "finance", entityType: kind === "customer" ? "Customer" : "Supplier", entityId: id, entityReference: `${report.party.code} · ${report.party.name}`, metadata: { format: "CSV", from: from.toISOString(), to: to.toISOString(), transactionCount: report.transactions.length } });
      return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}-statement-${report.party.code}-${to.toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
    }
    return Response.json(jsonSafe({ data: report, meta: { currencyCode: context.company.currencyCode } }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
