import { permittedBranchIds, requirePagePermission } from "@/lib/auth";
import { getBranchComparisonReport } from "@/lib/reports/services/branch-comparison";
import { BranchComparisonWorkspace } from "@/components/reports/branch-comparison-workspace";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (val: string | string[] | undefined) => (Array.isArray(val) ? val[0] : val);

export default async function BranchComparisonPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requirePagePermission("FINANCIAL_REPORTS_VIEW");
  const params = await searchParams;
  const companyId = context.company.id;
  const allowedBranches = permittedBranchIds(context, "FINANCIAL_REPORTS_VIEW");

  const today = new Date();
  const defaultFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0, 23, 59, 59, 999));

  const fromParam = first(params.from);
  const toParam = first(params.to);

  const from = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : defaultFrom;
  const to = toParam ? new Date(`${toParam}T23:59:59.999Z`) : defaultTo;

  const report = await getBranchComparisonReport({
    companyId,
    from,
    to,
    branchIds: allowedBranches || undefined,
  });

  return (
    <div className="mx-auto max-w-[1500px] pb-12">
      <BranchComparisonWorkspace
        branches={report.branches.map((b) => ({
          ...b,
          grossSales: b.grossSales.toString(),
          salesDiscounts: b.salesDiscounts.toString(),
          salesReturns: b.salesReturns.toString(),
          netSales: b.netSales.toString(),
          costOfGoodsSold: b.costOfGoodsSold.toString(),
          grossProfit: b.grossProfit.toString(),
          grossPurchases: b.grossPurchases.toString(),
          purchaseReturns: b.purchaseReturns.toString(),
          netPurchases: b.netPurchases.toString(),
          operatingExpenses: b.operatingExpenses.toString(),
          netProfit: b.netProfit.toString(),
          inventoryValuation: b.inventoryValuation.toString(),
          cashOnHand: b.cashOnHand.toString(),
          bankBalance: b.bankBalance.toString(),
          tradeReceivables: b.tradeReceivables.toString(),
          tradePayables: b.tradePayables.toString(),
        }))}
        companyTotal={{
          grossSales: report.companyTotal.grossSales.toString(),
          netSales: report.companyTotal.netSales.toString(),
          costOfGoodsSold: report.companyTotal.costOfGoodsSold.toString(),
          grossProfit: report.companyTotal.grossProfit.toString(),
          operatingExpenses: report.companyTotal.operatingExpenses.toString(),
          netProfit: report.companyTotal.netProfit.toString(),
          netPurchases: report.companyTotal.netPurchases.toString(),
          inventoryValuation: report.companyTotal.inventoryValuation.toString(),
          totalQuantity: report.companyTotal.totalQuantity,
          availableHandsets: report.companyTotal.availableHandsets,
          cashOnHand: report.companyTotal.cashOnHand.toString(),
          bankBalance: report.companyTotal.bankBalance.toString(),
          tradeReceivables: report.companyTotal.tradeReceivables.toString(),
          tradePayables: report.companyTotal.tradePayables.toString(),
        }}
        period={{
          from: from.toISOString(),
          to: to.toISOString(),
        }}
        currency={context.company.currencyCode}
        canExport={context.permissions.includes("FINANCIAL_REPORTS_EXPORT")}
      />
    </div>
  );
}

