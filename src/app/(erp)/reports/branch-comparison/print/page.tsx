import { notFound } from "next/navigation";
import { ReportPrintHeader } from "@/components/print/report-print-header";
import { ReportPrintSignatures } from "@/components/print/report-print-signatures";
import { permittedBranchIds, requirePagePermission } from "@/lib/auth";
import { getBranchComparisonReport } from "@/lib/reports/services/branch-comparison";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (val: string | string[] | undefined) => (Array.isArray(val) ? val[0] : val);

export default async function BranchComparisonPrintPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requirePagePermission("FINANCIAL_REPORTS_VIEW");
  const params = await searchParams;
  const companyId = context.company.id;
  const allowedBranches = permittedBranchIds(context, "FINANCIAL_REPORTS_VIEW");

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) notFound();

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

  const currency = company.currencyCode;

  return (
    <div className="mx-auto max-w-[1000px] bg-white p-8 text-slate-900 print:p-0">
      <ReportPrintHeader
        company={company}
        title="Branch Performance Comparison Statement"
        subtitle={`Comparative Operational, Financial & Inventory Matrix between ${report.branches.map((b) => b.code).join(" & ")}`}
        periodLabel={`Period: ${formatDate(from)} to ${formatDate(to)}`}
        backHref="/reports/branch-comparison"
      />

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-300">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900 text-white uppercase text-[9px] font-bold print:bg-black">
            <tr>
              <th className="p-2.5">Performance Dimension</th>
              {report.branches.map((b) => (
                <th key={b.branchId} className="p-2.5 text-right">
                  {b.code} ({b.name})
                </th>
              ))}
              <th className="p-2.5 text-right font-bold bg-slate-800">Company Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {/* 1. Sales */}
            <tr className="bg-slate-100 font-bold uppercase text-[9px] text-slate-800">
              <td colSpan={report.branches.length + 2} className="p-1.5">
                1. Sales & Revenue Operations
              </td>
            </tr>
            <tr>
              <td className="p-2">Sales Invoices Posted</td>
              {report.branches.map((b) => (
                <td key={b.branchId} className="p-2 text-right font-mono">
                  {b.salesInvoiceCount}
                </td>
              ))}
              <td className="p-2 text-right font-mono font-bold bg-slate-50">
                {report.branches.reduce((sum, b) => sum + b.salesInvoiceCount, 0)}
              </td>
            </tr>
            <tr>
              <td className="p-2 font-semibold">Gross Sales Revenue</td>
              {report.branches.map((b) => (
                <td key={b.branchId} className="p-2 text-right font-mono font-semibold">
                  {formatMoney(b.grossSales.toString(), currency)}
                </td>
              ))}
              <td className="p-2 text-right font-mono font-bold bg-slate-50">
                {formatMoney(report.companyTotal.grossSales.toString(), currency)}
              </td>
            </tr>
            <tr>
              <td className="p-2">Sales Returns & Refunds</td>
              {report.branches.map((b) => (
                <td key={b.branchId} className="p-2 text-right font-mono text-rose-700">
                  -{formatMoney(b.salesReturns.toString(), currency)}
                </td>
              ))}
              <td className="p-2 text-right font-mono font-bold text-rose-700 bg-slate-50">
                -{formatMoney(report.branches.reduce((sum, b) => Number(b.salesReturns) + sum, 0).toFixed(2), currency)}
              </td>
            </tr>
            <tr className="bg-blue-50/40 font-bold">
              <td className="p-2 text-blue-900">Net Sales</td>
              {report.branches.map((b) => (
                <td key={b.branchId} className="p-2 text-right font-mono text-blue-900 font-bold">
                  {formatMoney(b.netSales.toString(), currency)}
                </td>
              ))}
              <td className="p-2 text-right font-mono font-bold text-blue-900 bg-blue-100/50">
                {formatMoney(report.companyTotal.netSales.toString(), currency)}
              </td>
            </tr>

            {/* 2. Profitability */}
            <tr className="bg-slate-100 font-bold uppercase text-[9px] text-slate-800">
              <td colSpan={report.branches.length + 2} className="p-1.5">
                2. Cost of Sales & Margins
              </td>
            </tr>
            <tr>
              <td className="p-2">Cost of Goods Sold (COGS)</td>
              {report.branches.map((b) => (
                <td key={b.branchId} className="p-2 text-right font-mono">
                  {formatMoney(b.costOfGoodsSold.toString(), currency)}
                </td>
              ))}
              <td className="p-2 text-right font-mono font-bold bg-slate-50">
                {formatMoney(report.companyTotal.costOfGoodsSold.toString(), currency)}
              </td>
            </tr>
            <tr className="font-bold text-emerald-900 bg-emerald-50/30">
              <td className="p-2">Gross Profit</td>
              {report.branches.map((b) => (
                <td key={b.branchId} className="p-2 text-right font-mono font-bold text-emerald-800">
                  {formatMoney(b.grossProfit.toString(), currency)}
                </td>
              ))}
              <td className="p-2 text-right font-mono font-bold text-emerald-950 bg-emerald-100/50">
                {formatMoney(report.companyTotal.grossProfit.toString(), currency)}
              </td>
            </tr>
            <tr>
              <td className="p-2 font-medium">Gross Profit Margin %</td>
              {report.branches.map((b) => (
                <td key={b.branchId} className="p-2 text-right font-mono font-bold">
                  {b.grossProfitMarginPercent}%
                </td>
              ))}
              <td className="p-2 text-right font-mono font-bold bg-slate-50">
                {Number(report.companyTotal.netSales) > 0
                  ? `${(
                      (Number(report.companyTotal.grossProfit) /
                        Number(report.companyTotal.netSales)) *
                      100
                    ).toFixed(2)}%`
                  : "0.00%"}
              </td>
            </tr>

            {/* 3. Expenses & Net Profit */}
            <tr className="bg-slate-100 font-bold uppercase text-[9px] text-slate-800">
              <td colSpan={report.branches.length + 2} className="p-1.5">
                3. Operating Expenses & Net Contribution
              </td>
            </tr>
            <tr>
              <td className="p-2">Branch Operating Expenses</td>
              {report.branches.map((b) => (
                <td key={b.branchId} className="p-2 text-right font-mono text-rose-700">
                  {formatMoney(b.operatingExpenses.toString(), currency)}
                </td>
              ))}
              <td className="p-2 text-right font-mono font-bold text-rose-800 bg-slate-50">
                {formatMoney(report.companyTotal.operatingExpenses.toString(), currency)}
              </td>
            </tr>
            <tr className="bg-slate-100 font-bold">
              <td className="p-2 text-slate-900">Net Operating Profit</td>
              {report.branches.map((b) => (
                <td key={b.branchId} className="p-2 text-right font-mono font-bold text-slate-900">
                  {formatMoney(b.netProfit.toString(), currency)}
                </td>
              ))}
              <td className="p-2 text-right font-mono font-bold text-slate-950 bg-slate-200">
                {formatMoney(report.companyTotal.netProfit.toString(), currency)}
              </td>
            </tr>

            {/* 4. Inventory */}
            <tr className="bg-slate-100 font-bold uppercase text-[9px] text-slate-800">
              <td colSpan={report.branches.length + 2} className="p-1.5">
                4. Inventory Valuation & Physical Stock
              </td>
            </tr>
            <tr>
              <td className="p-2">Current Inventory Valuation</td>
              {report.branches.map((b) => (
                <td key={b.branchId} className="p-2 text-right font-mono font-bold">
                  {formatMoney(b.inventoryValuation.toString(), currency)}
                </td>
              ))}
              <td className="p-2 text-right font-mono font-bold bg-slate-50">
                {formatMoney(report.companyTotal.inventoryValuation.toString(), currency)}
              </td>
            </tr>
            <tr>
              <td className="p-2">Available Handset Units</td>
              {report.branches.map((b) => (
                <td key={b.branchId} className="p-2 text-right font-mono">
                  {b.availableHandsets}
                </td>
              ))}
              <td className="p-2 text-right font-mono font-bold bg-slate-50">
                {report.companyTotal.availableHandsets}
              </td>
            </tr>

            {/* 5. Treasury */}
            <tr className="bg-slate-100 font-bold uppercase text-[9px] text-slate-800">
              <td colSpan={report.branches.length + 2} className="p-1.5">
                5. Working Capital & Treasury
              </td>
            </tr>
            <tr>
              <td className="p-2">Cash on Hand (GL 1000)</td>
              {report.branches.map((b) => (
                <td key={b.branchId} className="p-2 text-right font-mono font-bold">
                  {formatMoney(b.cashOnHand.toString(), currency)}
                </td>
              ))}
              <td className="p-2 text-right font-mono font-bold bg-slate-50">
                {formatMoney(report.companyTotal.cashOnHand.toString(), currency)}
              </td>
            </tr>
            <tr>
              <td className="p-2">Bank Accounts (GL 1010)</td>
              {report.branches.map((b) => (
                <td key={b.branchId} className="p-2 text-right font-mono font-bold">
                  {formatMoney(b.bankBalance.toString(), currency)}
                </td>
              ))}
              <td className="p-2 text-right font-mono font-bold bg-slate-50">
                {formatMoney(report.companyTotal.bankBalance.toString(), currency)}
              </td>
            </tr>
            <tr>
              <td className="p-2">Accounts Receivable (GL 1100)</td>
              {report.branches.map((b) => (
                <td key={b.branchId} className="p-2 text-right font-mono">
                  {formatMoney(b.tradeReceivables.toString(), currency)}
                </td>
              ))}
              <td className="p-2 text-right font-mono font-bold bg-slate-50">
                {formatMoney(report.companyTotal.tradeReceivables.toString(), currency)}
              </td>
            </tr>
            <tr>
              <td className="p-2">Accounts Payable (GL 2000)</td>
              {report.branches.map((b) => (
                <td key={b.branchId} className="p-2 text-right font-mono">
                  {formatMoney(b.tradePayables.toString(), currency)}
                </td>
              ))}
              <td className="p-2 text-right font-mono font-bold bg-slate-50">
                {formatMoney(report.companyTotal.tradePayables.toString(), currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <ReportPrintSignatures />
      </div>

      <footer className="mt-12 border-t border-slate-200 pt-4 text-center text-[10px] text-slate-400">
        <p>© 2026 Copyright Reserved · Qasim Ali · 0315-5049489</p>
      </footer>
    </div>
  );
}
