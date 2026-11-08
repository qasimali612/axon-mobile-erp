import { ApiError, apiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { getTrialBalance } from "@/lib/finance/reports";
import { prisma } from "@/lib/prisma";

function csvCell(value: string) {
  const protectedValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  try {
    const context = await requirePermission("FINANCIAL_REPORTS_EXPORT");
    const params = new URL(request.url).searchParams;
    const periodId = params.get("period");
    if (!periodId) throw new ApiError(422, "PERIOD_REQUIRED", "Select an accounting period.");
    const period = await prisma.accountingPeriod.findFirst({
      where: { id: periodId, companyId: context.company.id },
      include: { fiscalYear: { select: { code: true } } },
    });
    if (!period) throw new ApiError(404, "PERIOD_NOT_FOUND", "Accounting period was not found.");
    const allowedBranches = permittedBranchIds(context, "FINANCIAL_REPORTS_EXPORT");
    const requestedBranch = params.get("branch") || undefined;
    if (requestedBranch && allowedBranches && !allowedBranches.includes(requestedBranch)) {
      throw new ApiError(403, "BRANCH_SCOPE_FORBIDDEN", "You cannot export this branch.");
    }
    const report = await getTrialBalance({
      companyId: context.company.id,
      from: period.startDate,
      to: period.endDate,
      branchId: requestedBranch,
      branchIds: requestedBranch ? undefined : allowedBranches || undefined,
    });
    const rows = [
      ["Account code", "Account name", "Class", "Opening debit", "Opening credit", "Period debit", "Period credit", "Closing debit", "Closing credit"],
      ...report.rows.map((row) => [
        row.code,
        row.name,
        row.accountClass,
        row.openingDebit.toFixed(4),
        row.openingCredit.toFixed(4),
        row.periodDebit.toFixed(4),
        row.periodCredit.toFixed(4),
        row.closingDebit.toFixed(4),
        row.closingCredit.toFixed(4),
      ]),
      [
        "",
        "TOTAL",
        "",
        report.totals.openingDebit.toFixed(4),
        report.totals.openingCredit.toFixed(4),
        report.totals.periodDebit.toFixed(4),
        report.totals.periodCredit.toFixed(4),
        report.totals.closingDebit.toFixed(4),
        report.totals.closingCredit.toFixed(4),
      ],
    ];
    const csv = `\uFEFF${rows.map((row) => row.map((value) => csvCell(String(value))).join(",")).join("\r\n")}`;
    await appendAudit({
      companyId: context.company.id,
      actorId: context.user.id,
      branchId: requestedBranch || null,
      action: "TRIAL_BALANCE_EXPORTED",
      module: "finance",
      entityType: "FinancialReport",
      entityId: period.id,
      entityReference: `${period.name} ${period.fiscalYear.code}`,
      metadata: { format: "CSV", rowCount: report.rows.length },
    });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="trial-balance-${period.fiscalYear.code}-${period.number}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
