import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { getCashInHandReport } from "@/lib/finance/cash-in-hand";
import { formatDate } from "@/lib/utils";
import { jsonSafe } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const context = await requirePermission("FINANCIAL_REPORTS_VIEW");
    const { searchParams } = new URL(request.url);

    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const branchParam = searchParams.get("branchId") || searchParams.get("branch") || undefined;
    const accountParam = searchParams.get("accountId") || searchParams.get("account") || undefined;
    const format = searchParams.get("format");

    const allowedBranchIds = permittedBranchIds(context, "FINANCIAL_REPORTS_VIEW");
    const branchId =
      branchParam && (!allowedBranchIds || allowedBranchIds.includes(branchParam))
        ? branchParam
        : undefined;

    const today = new Date();
    const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1);
    const defaultTo = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    const from = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : defaultFrom;
    const to = toParam ? new Date(`${toParam}T23:59:59.999Z`) : defaultTo;

    const report = await getCashInHandReport({
      companyId: context.company.id,
      from,
      to,
      branchId,
      branchIds: branchId ? undefined : allowedBranchIds || undefined,
      accountId: accountParam,
    });

    if (format === "csv") {
      if (!context.permissions.includes("FINANCIAL_REPORTS_EXPORT")) {
        return new NextResponse("Export permission denied", { status: 403 });
      }

      const rows: string[] = [
        `"AXON MOBILE ERP - CASH IN HAND REPORT"`,
        `"Company","${context.company.name} (${context.company.code})"`,
        `"Currency","${context.company.currencyCode}"`,
        `"Period","${formatDate(from)} to ${formatDate(to)}"`,
        `"Branch","${branchId || "All Authorized Branches"}"`,
        "",
        `"EXECUTIVE CASH ROLL-FORWARD SUMMARY"`,
        `"Opening Cash Balance","${report.periodSummary.openingBalance.toFixed(2)}"`,
        `"Total Cash Inflows","${report.periodSummary.totalInflows.toFixed(2)}"`,
        `"Total Cash Outflows","${report.periodSummary.totalOutflows.toFixed(2)}"`,
        `"Net Cash Movement","${report.periodSummary.netMovement.toFixed(2)}"`,
        `"Closing Book Balance","${report.periodSummary.closingBalance.toFixed(2)}"`,
        "",
        `"ITEMIZED CASH MOVEMENT LEDGER"`,
        `"Date","Voucher #","Branch","Type","Source Module","Narration / Description","Party","Cash In (Debit)","Cash Out (Credit)","Running Balance"`,
      ];

      for (const m of report.movements) {
        const cleanNarration = (m.description || m.narration || "").replace(/"/g, '""');
        const cleanParty = (m.party || "").replace(/"/g, '""');
        rows.push(
          `"${formatDate(m.postingDate)}","${m.voucherNumber}","${m.branch.code}","${m.voucherType}","${m.sourceModule || "MANUAL"}","${cleanNarration}","${cleanParty}","${m.cashIn.toFixed(2)}","${m.cashOut.toFixed(2)}","${m.runningBalance.toFixed(2)}"`
        );
      }

      return new NextResponse(rows.join("\r\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="Cash-In-Hand-${formatDate(from)}-to-${formatDate(to)}.csv"`,
        },
      });
    }

    return NextResponse.json(jsonSafe({ data: report }));
  } catch (error) {
    return apiError(error);
  }
}

