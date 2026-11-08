import { permittedBranchIds, requirePagePermission } from "@/lib/auth";
import { getCashInHandReport } from "@/lib/finance/cash-in-hand";
import { prisma } from "@/lib/prisma";
import { CashInHandWorkspace } from "@/components/finance/cash-in-hand-workspace";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (val: string | string[] | undefined) =>
  Array.isArray(val) ? val[0] : val;

export default async function CashInHandReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requirePagePermission("FINANCIAL_REPORTS_VIEW");
  const params = await searchParams;
  const companyId = context.company.id;
  const allowedBranches = permittedBranchIds(context, "FINANCIAL_REPORTS_VIEW");

  const branches = await prisma.branch.findMany({
    where: {
      companyId,
      isActive: true,
      ...(allowedBranches ? { id: { in: allowedBranches } } : {}),
    },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  const today = new Date();
  const defaultFromStr = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const defaultToStr = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const fromDate = first(params.from) || defaultFromStr;
  const toDate = first(params.to) || defaultToStr;

  const requestedBranch = first(params.branch);
  const branchId =
    requestedBranch && (!allowedBranches || allowedBranches.includes(requestedBranch))
      ? requestedBranch
      : undefined;

  const accountId = first(params.account) || undefined;

  const report = await getCashInHandReport({
    companyId,
    from: new Date(`${fromDate}T00:00:00.000Z`),
    to: new Date(`${toDate}T23:59:59.999Z`),
    branchId,
    branchIds: branchId ? undefined : allowedBranches || undefined,
    accountId,
  });

  return (
    <CashInHandWorkspace
      initialData={{
        accounts: report.accounts,
        periodSummary: {
          openingBalance: report.periodSummary.openingBalance.toString(),
          totalInflows: report.periodSummary.totalInflows.toString(),
          totalOutflows: report.periodSummary.totalOutflows.toString(),
          netMovement: report.periodSummary.netMovement.toString(),
          closingBalance: report.periodSummary.closingBalance.toString(),
        },
        sourceBreakdown: {
          inflows: report.sourceBreakdown.inflows.map((i) => ({
            ...i,
            total: i.total.toString(),
          })),
          outflows: report.sourceBreakdown.outflows.map((o) => ({
            ...o,
            total: o.total.toString(),
          })),
        },
        movements: report.movements.map((m) => ({
          ...m,
          cashIn: m.cashIn.toString(),
          cashOut: m.cashOut.toString(),
          runningBalance: m.runningBalance.toString(),
        })),
      }}
      branches={branches}
      currency={context.company.currencyCode}
      canExport={context.permissions.includes("FINANCIAL_REPORTS_EXPORT")}
      selectedBranchId={branchId}
      selectedAccountId={accountId}
      fromDate={fromDate}
      toDate={toDate}
    />
  );
}

