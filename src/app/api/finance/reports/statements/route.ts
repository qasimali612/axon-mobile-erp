import { ApiError, apiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { getFinancialStatements } from "@/lib/finance/reports";
import { prisma } from "@/lib/prisma";

function csvCell(value: string) {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${guarded.replaceAll('"', '""')}"`;
}

/** Exports the profit and loss, balance sheet and cash-flow statement for one period as CSV. */
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
    const statement = await getFinancialStatements({
      companyId: context.company.id,
      from: period.startDate,
      to: period.endDate,
      branchId: requestedBranch,
      branchIds: requestedBranch ? undefined : allowedBranches || undefined,
    });

    const rows: string[][] = [
      ["Section", "Code", "Account", "Amount"],
      ...statement.profitAndLoss.map((row) => ["PROFIT_AND_LOSS", row.code, row.name, row.amount.toFixed(4)]),
      ["PROFIT_AND_LOSS", "", "Revenue", statement.totals.revenue.toFixed(4)],
      ["PROFIT_AND_LOSS", "", "Cost of goods sold", statement.totals.cogs.toFixed(4)],
      ["PROFIT_AND_LOSS", "", "Gross profit", statement.totals.grossProfit.toFixed(4)],
      ["PROFIT_AND_LOSS", "", "Operating expenses", statement.totals.expenses.toFixed(4)],
      ["PROFIT_AND_LOSS", "", "Net profit / (loss)", statement.totals.netProfit.toFixed(4)],
      ...statement.balanceSheet.map((row) => ["BALANCE_SHEET", row.code, row.name, row.amount.toFixed(4)]),
      ["BALANCE_SHEET", "", "Total assets", statement.totals.assets.toFixed(4)],
      ["BALANCE_SHEET", "", "Total liabilities", statement.totals.liabilities.toFixed(4)],
      ["BALANCE_SHEET", "", "Equity", statement.totals.equity.toFixed(4)],
      ["BALANCE_SHEET", "", "Cumulative earnings", statement.totals.cumulativeEarnings.toFixed(4)],
      ["BALANCE_SHEET", "", "Balance difference", statement.totals.balanceDifference.toFixed(4)],
      ["CASH_FLOW", "", "Operating", statement.cashFlow.OPERATING.toFixed(4)],
      ["CASH_FLOW", "", "Investing", statement.cashFlow.INVESTING.toFixed(4)],
      ["CASH_FLOW", "", "Financing", statement.cashFlow.FINANCING.toFixed(4)],
      ["CASH_FLOW", "", "Unclassified", statement.cashFlow.NONE.toFixed(4)],
      ["CASH_FLOW", "", "Net movement", statement.cashFlow.netMovement.toFixed(4)],
    ];
    const csv = `\uFEFF${rows.map((row) => row.map((value) => csvCell(String(value))).join(",")).join("\r\n")}`;
    await appendAudit({
      companyId: context.company.id,
      actorId: context.user.id,
      branchId: requestedBranch || null,
      action: "FINANCIAL_STATEMENTS_EXPORTED",
      module: "finance",
      entityType: "FinancialReport",
      entityId: period.id,
      entityReference: `${period.name} ${period.fiscalYear.code}`,
      metadata: { format: "CSV", sections: ["PROFIT_AND_LOSS", "BALANCE_SHEET", "CASH_FLOW"] },
    });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="financial-statements-${period.fiscalYear.code}-${period.number}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
