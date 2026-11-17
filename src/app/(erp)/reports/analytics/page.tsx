import { permittedBranchIds, requirePagePermission } from "@/lib/auth";
import { getBusinessAnalytics } from "@/lib/reports/services/analytics-reports";
import { BusinessAnalyticsWorkspace } from "@/components/reports/analytics-workspace";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (val: string | string[] | undefined) => (Array.isArray(val) ? val[0] : val);

export default async function BusinessAnalyticsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requirePagePermission("FINANCIAL_REPORTS_VIEW");
  const params = await searchParams;
  const companyId = context.company.id;
  const allowedBranches = permittedBranchIds(context, "FINANCIAL_REPORTS_VIEW");

  const fromParam = first(params.from);
  const toParam = first(params.to);

  const from = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : undefined;
  const to = toParam ? new Date(`${toParam}T23:59:59.999Z`) : undefined;

  const branchParam = first(params.branch);
  const branchId =
    branchParam && (!allowedBranches || allowedBranches.includes(branchParam))
      ? branchParam
      : undefined;

  const data = await getBusinessAnalytics({
    companyId,
    from,
    to,
    branchId,
    branchIds: branchId ? undefined : allowedBranches || undefined,
  });

  return (
    <div className="mx-auto max-w-[1500px] pb-12">
      <BusinessAnalyticsWorkspace
        data={{
          top10ProductsByVolume: data.top10ProductsByVolume.map((p) => ({
            ...p,
            revenue: p.revenue.toString(),
            cost: p.cost.toString(),
            grossProfit: p.grossProfit.toString(),
          })),
          top10ProductsByRevenue: data.top10ProductsByRevenue.map((p) => ({
            ...p,
            revenue: p.revenue.toString(),
            cost: p.cost.toString(),
            grossProfit: p.grossProfit.toString(),
          })),
          topBrands: data.topBrands.map((b) => ({
            ...b,
            revenue: b.revenue.toString(),
            cost: b.cost.toString(),
            grossProfit: b.grossProfit.toString(),
          })),
          salespersonLeaderboard: data.salespersonLeaderboard.map((sp) => ({
            ...sp,
            revenue: sp.revenue.toString(),
            cost: sp.cost.toString(),
            grossProfit: sp.grossProfit.toString(),
          })),
          branchRanking: data.branchRanking.map((br) => ({
            ...br,
            revenue: br.revenue.toString(),
            cost: br.cost.toString(),
            grossProfit: br.grossProfit.toString(),
          })),
          highMarginProducts: data.highMarginProducts.map((p) => ({
            ...p,
            revenue: p.revenue.toString(),
            cost: p.cost.toString(),
            grossProfit: p.grossProfit.toString(),
          })),
          lowMarginProducts: data.lowMarginProducts.map((p) => ({
            ...p,
            revenue: p.revenue.toString(),
            cost: p.cost.toString(),
            grossProfit: p.grossProfit.toString(),
          })),
          slowMovingProducts: data.slowMovingProducts.map((p) => ({
            ...p,
            inventoryValue: p.inventoryValue.toString(),
          })),
          totalLinesAnalyzed: data.totalLinesAnalyzed,
        }}
        currency={context.company.currencyCode}
      />
    </div>
  );
}
