import { PrintButton } from "@/components/purchase/print-button";
import { permittedBranchIds, requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const money = (value: { toString(): string }, currency: string) => new Intl.NumberFormat("en-PK", { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(value.toString()));
const date = (value: Date | null) => value ? new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", day: "2-digit", month: "short", year: "numeric" }).format(value) : "—";

export default async function IncentiveRegisterPrintPage() {
  const context = await requirePagePermission("INCENTIVE_VIEW");
  const branches = permittedBranchIds(context, "INCENTIVE_VIEW");
  const [company, calculations, claims] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: context.company.id } }),
    prisma.incentiveCalculation.findMany({
      where: { companyId: context.company.id, ...(branches ? { branchId: { in: branches } } : {}) },
      include: { plan: { select: { code: true } }, branch: { select: { code: true } }, recipientUser: { select: { fullName: true } }, recipientCustomer: { select: { name: true } }, payable: { select: { voucherNumber: true, paidAmount: true, outstandingAmount: true } } },
      orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
      take: 400,
    }),
    prisma.receivedIncentive.findMany({
      where: { companyId: context.company.id },
      include: { supplier: { select: { name: true } } },
      orderBy: [{ periodEnd: "desc" }],
      take: 200,
    }),
  ]);
  const currency = company.currencyCode;
  const totals = calculations.reduce((sum, row) => ({
    approved: sum.approved + Number(row.approvedAmount),
    paid: sum.paid + Number(row.payable?.paidAmount ?? 0),
    outstanding: sum.outstanding + Number(row.payable?.outstandingAmount ?? 0),
  }), { approved: 0, paid: 0, outstanding: 0 });

  return <div className="mx-auto max-w-[1100px]">
    <div className="no-print mb-4 flex items-center justify-between rounded-xl border bg-white p-3">
      <div><p className="text-sm font-bold">Print preview · Incentive register</p><p className="text-xs text-slate-500">Calculated, approved, accrued and settled incentives with supplier claims.</p></div>
      <PrintButton label="Print register / save PDF" />
    </div>
    <article className="print-document min-h-[1100px] rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <header className="flex items-start justify-between border-b-2 border-blue-700 pb-5">
        <div className="flex gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-xl bg-blue-700 text-xl font-black text-white">{company.code.slice(0, 2)}</div>
          <div><h1 className="text-xl font-black uppercase">{company.legalName || company.name}</h1><p className="mt-1 text-xs text-slate-600">Incentive register · generated {date(new Date())}</p></div>
        </div>
        <div className="text-right text-xs"><div className="font-bold uppercase tracking-[.18em] text-blue-700">Incentives</div><div className="mt-1 text-lg font-black">{calculations.length} calculations</div></div>
      </header>
      <section className="print-break-avoid mt-4 grid grid-cols-3 gap-3 text-xs">
        <div className="rounded-xl border p-3"><div className="text-[9px] font-bold uppercase text-slate-400">Approved</div><div className="mt-1 text-sm font-black">{money({ toString: () => totals.approved.toFixed(4) }, currency)}</div></div>
        <div className="rounded-xl border p-3"><div className="text-[9px] font-bold uppercase text-slate-400">Paid</div><div className="mt-1 text-sm font-black">{money({ toString: () => totals.paid.toFixed(4) }, currency)}</div></div>
        <div className="rounded-xl border p-3"><div className="text-[9px] font-bold uppercase text-slate-400">Outstanding</div><div className="mt-1 text-sm font-black">{money({ toString: () => totals.outstanding.toFixed(4) }, currency)}</div></div>
      </section>
      <table className="mt-5 w-full border-collapse text-[10px]">
        <thead><tr className="bg-blue-700 text-white"><th className="px-2 py-2 text-left">Plan</th><th className="px-2 py-2 text-left">Period</th><th className="px-2 py-2 text-left">Recipient</th><th className="px-2 py-2 text-right">Calculated</th><th className="px-2 py-2 text-right">Approved</th><th className="px-2 py-2 text-right">Paid</th><th className="px-2 py-2 text-right">Outstanding</th><th className="px-2 py-2 text-left">Voucher</th><th className="px-2 py-2 text-left">Status</th></tr></thead>
        <tbody>{calculations.map((row) => <tr key={row.id} className="print-break-avoid border-b">
          <td className="px-2 py-2 font-bold">{row.plan.code}</td>
          <td className="px-2 py-2">{date(row.periodStart)} – {date(row.periodEnd)}</td>
          <td className="px-2 py-2">{row.recipientUser?.fullName ?? row.recipientCustomer?.name ?? row.recipientName ?? "—"}<span className="block text-[8px] text-slate-500">{row.branch?.code ?? ""}</span></td>
          <td className="px-2 py-2 text-right">{money(row.calculatedAmount, currency)}</td>
          <td className="px-2 py-2 text-right">{money(row.approvedAmount, currency)}</td>
          <td className="px-2 py-2 text-right">{money(row.payable?.paidAmount ?? { toString: () => "0" }, currency)}</td>
          <td className="px-2 py-2 text-right font-bold">{money(row.payable?.outstandingAmount ?? { toString: () => "0" }, currency)}</td>
          <td className="px-2 py-2 font-mono text-[8px]">{row.payable?.voucherNumber ?? "—"}</td>
          <td className="px-2 py-2">{row.status}</td>
        </tr>)}</tbody>
      </table>
      {!calculations.length ? <p className="py-10 text-center text-xs text-slate-400">No incentive calculation recorded.</p> : null}

      <h2 className="mt-8 text-xs font-black uppercase tracking-wider text-blue-800">Supplier incentives</h2>
      <table className="mt-2 w-full border-collapse text-[10px]">
        <thead><tr className="bg-slate-100 text-left"><th className="px-2 py-2">Reference</th><th className="px-2 py-2">Payer / program</th><th className="px-2 py-2">Period</th><th className="px-2 py-2 text-right">Eligible</th><th className="px-2 py-2 text-right">Received</th><th className="px-2 py-2 text-right">Outstanding</th><th className="px-2 py-2">Status</th></tr></thead>
        <tbody>{claims.map((claim) => <tr key={claim.id} className="print-break-avoid border-b">
          <td className="px-2 py-2 font-bold">{claim.referenceNumber}</td>
          <td className="px-2 py-2">{claim.payerName}<span className="block text-[8px] text-slate-500">{claim.programName}</span></td>
          <td className="px-2 py-2">{date(claim.periodStart)} – {date(claim.periodEnd)}</td>
          <td className="px-2 py-2 text-right">{money(claim.eligibleAmount, currency)}</td>
          <td className="px-2 py-2 text-right">{money(claim.receivedAmount, currency)}</td>
          <td className="px-2 py-2 text-right font-bold">{money(claim.outstandingAmount, currency)}</td>
          <td className="px-2 py-2">{claim.status}</td>
        </tr>)}</tbody>
      </table>
      {!claims.length ? <p className="py-6 text-center text-xs text-slate-400">No supplier incentive claim recorded.</p> : null}
      <footer className="print-break-avoid mt-8 flex items-end justify-between border-t pt-4 text-[9px] leading-4 text-slate-500">
        <div>Accrual vouchers are posted journals; paid and outstanding columns trace to the settlement journals.</div>
        <div className="text-right">Generated {new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: company.timeZone }).format(new Date())}</div>
      </footer>
    </article>
  </div>;
}
