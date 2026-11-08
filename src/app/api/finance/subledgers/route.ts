import { NextResponse } from "next/server";
import { ApiError, apiError, parsePagination } from "@/lib/api";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { getPartyAgingSummary, parseLedgerDate, type PartyLedgerKind } from "@/lib/finance/subledger";
import { jsonSafe } from "@/lib/serializers";

function parseKind(value: string | null): PartyLedgerKind {
  if (value === "customer" || value === "supplier") return value;
  throw new ApiError(422, "INVALID_PARTY_LEDGER", "Ledger type must be customer or supplier.");
}

export async function GET(request: Request) {
  try {
    const { page, pageSize, params } = parsePagination(request.url);
    const kind = parseKind(params.get("type"));
    const permission = kind === "customer" ? "CUSTOMER_LEDGER_VIEW" : "SUPPLIER_LEDGER_VIEW";
    const context = await requirePermission(permission);
    const allowedBranches = permittedBranchIds(context, permission);
    const requestedBranchId = params.get("branchId") || null;
    if (requestedBranchId && allowedBranches && !allowedBranches.includes(requestedBranchId)) throw new ApiError(403, "BRANCH_SCOPE_FORBIDDEN", "You cannot view this branch ledger.");
    const asOf = parseLedgerDate(params.get("asOf"), "As-of date", new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`));
    const report = await getPartyAgingSummary({ companyId: context.company.id, kind, asOf, branchIds: requestedBranchId ? [requestedBranchId] : allowedBranches, search: params.get("search")?.trim() || undefined, page, pageSize });
    return NextResponse.json(jsonSafe({ data: report.rows, totals: report.totals, pagination: report.pagination, meta: { kind, asOf, currencyCode: context.company.currencyCode } }));
  } catch (error) { return apiError(error); }
}
