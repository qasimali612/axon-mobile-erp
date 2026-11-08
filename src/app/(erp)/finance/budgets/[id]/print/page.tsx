import { notFound } from "next/navigation";
import { PrintButton } from "@/components/purchase/print-button";
import { assertPermittedBranch, requirePagePermission } from "@/lib/auth";
import { budgetVariance } from "@/lib/finance/budgets";
import { prisma } from "@/lib/prisma";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };
const money = (value: string, currency: string) => new Intl.NumberFormat("en-PK", { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(value));
const date = (value: Date | null) => value ? new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", day: "2-digit", month: "short", year: "numeric" }).format(value) : "—";

export default async function BudgetPrintPage({ params }: PageProps) {
  const context = await requirePagePermission("BUDGET_VIEW");
  const id = idSchema.parse((await params).id);
  const record = await prisma.budget.findFirst({
    where: { id, companyId: context.company.id },
    include: {
      company: true,
      fiscalYear: { select: { code: true, name: true, startDate: true, endDate: true } },
      branch: { select: { code: true, name: true } },
      department: { select: { code: true, name: true } },
      costCenter: { select: { code: true, name: true } },
      createdBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      lines: { include: { account: { select: { code: true, name: true } }, period: { select: { name: true, number: true } } }, orderBy: [{ account: { code: "asc" } }, { period: { number: "asc" } }] },
    },
  });
  if (!record) notFound();
  if (record.branchId) assertPermittedBranch(context, "BUDGET_VIEW", record.branchId);
  const variance = await budgetVariance({ companyId: context.company.id, userId: context.user.id }, id);
  const currency = record.company.currencyCode;
  const budgetTotal = record.lines.reduce((sum, line) => sum + Number(line.amount), 0);

  return <div className="mx-auto max-w-[1100px]">
    <div className="no-print mb-4 flex items-center justify-between rounded-xl border bg-white p-3">
      <div><p className="text-sm font-bold">Print preview · {record.code} v{record.version}</p><p className="text-xs text-slate-500">Budget version with approved lines and variance against posted journals.</p></div>
      <PrintButton label="Print budget / save PDF" />
    </div>
    <article className="print-document min-h-[1100px] rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <header className="flex items-start justify-between border-b-2 border-blue-700 pb-5">
        <div className="flex gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-xl bg-blue-700 text-xl font-black text-white">{record.company.code.slice(0, 2)}</div>
          <div>
            <h1 className="text-xl font-black uppercase">{record.company.legalName || record.company.name}</h1>
            <p className="mt-1 text-xs text-slate-600">{[record.company.addressLine1, record.company.city, record.company.province].filter(Boolean).join(", ")}</p>
            <p className="mt-1 text-xs text-slate-600">{record.fiscalYear.name} · {date(record.fiscalYear.startDate)} – {date(record.fiscalYear.endDate)}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">Budget version</div>
          <div className="mt-1 text-2xl font-black">{record.code} · v{record.version}</div>
          <span className="mt-2 inline-block rounded-full bg-blue-100 px-3 py-1 text-[10px] font-bold text-blue-800">{record.status}</span>
        </div>
      </header>
      <section className="print-break-avoid mt-5 grid grid-cols-2 gap-6 rounded-xl border p-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Budget</div>
          <div className="mt-1 text-sm font-bold">{record.name}</div>
          <div className="mt-1 text-xs text-slate-600">Branch: {record.branch ? `${record.branch.code} · ${record.branch.name}` : "Company-wide"}</div>
          <div className="text-xs text-slate-600">Department: {record.department ? `${record.department.code} · ${record.department.name}` : "—"}</div>
          <div className="text-xs text-slate-600">Cost centre: {record.costCenter ? `${record.costCenter.code} · ${record.costCenter.name}` : "—"}</div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <dt className="text-slate-500">Total budget</dt><dd className="text-right font-bold">{money(String(budgetTotal), currency)}</dd>
          <dt className="text-slate-500">Prepared by</dt><dd className="text-right font-semibold">{record.createdBy?.fullName ?? "—"}</dd>
          <dt className="text-slate-500">Approved by</dt><dd className="text-right font-semibold">{record.approvedBy?.fullName ?? "Not approved"}</dd>
          <dt className="text-slate-500">Submitted</dt><dd className="text-right font-semibold">{date(record.submittedAt)}</dd>
          <dt className="text-slate-500">Approved</dt><dd className="text-right font-semibold">{date(record.approvedAt)}</dd>
          <dt className="text-slate-500">Closed</dt><dd className="text-right font-semibold">{date(record.closedAt)}</dd>
        </dl>
      </section>
      <table className="mt-5 w-full border-collapse text-[11px]">
        <thead><tr className="bg-blue-700 text-white"><th className="px-2 py-2.5 text-left">Account</th><th className="px-2 py-2.5 text-left">Period</th><th className="px-2 py-2.5 text-right">Budget</th><th className="px-2 py-2.5 text-right">Actual (posted)</th><th className="px-2 py-2.5 text-right">Variance</th><th className="px-2 py-2.5 text-left">Notes</th></tr></thead>
        <tbody>
          {record.lines.map((line) => {
            const row = variance.rows.find((entry) => entry.accountId === line.accountId && entry.periodId === line.periodId);
            return <tr key={line.id} className="print-break-avoid border-b align-top">
              <td className="px-2 py-2"><div className="font-bold">{line.account.code} · {line.account.name}</div></td>
              <td className="px-2 py-2">{line.period.name}</td>
              <td className="px-2 py-2 text-right">{money(line.amount.toString(), currency)}</td>
              <td className="px-2 py-2 text-right">{money(row?.actual ?? "0", currency)}</td>
              <td className={`px-2 py-2 text-right font-bold ${Number(row?.variance ?? 0) < 0 ? "text-red-700" : ""}`}>{money(row?.variance ?? "0", currency)}</td>
              <td className="px-2 py-2 text-[10px] text-slate-500">{line.notes ?? ""}</td>
            </tr>;
          })}
        </tbody>
        <tfoot><tr className="bg-slate-100 font-black"><td className="px-2 py-2.5" colSpan={2}>Totals</td><td className="px-2 py-2.5 text-right">{money(variance.totals.budget, currency)}</td><td className="px-2 py-2.5 text-right">{money(variance.totals.actual, currency)}</td><td className="px-2 py-2.5 text-right">{money(variance.totals.variance, currency)}</td><td /></tr></tfoot>
      </table>
      <footer className="print-break-avoid mt-10 flex items-end justify-between border-t pt-4 text-[9px] leading-4 text-slate-500">
        <div>Variance = budget − posted actual. Only posted journals in this version&apos;s scope are compared.</div>
        <div className="text-right"><div>Generated {new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: context.company.timeZone }).format(new Date())}</div><div>Record ID: {record.id}</div></div>
      </footer>
    </article>
  </div>;
}
