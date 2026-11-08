import { PrintButton } from "@/components/purchase/print-button";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const money = (value: { toString(): string }, currency: string) => new Intl.NumberFormat("en-PK", { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(value.toString()));
const date = (value: Date | null) => value ? new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", day: "2-digit", month: "short", year: "numeric" }).format(value) : "—";

export default async function RebateRegisterPrintPage() {
  const context = await requirePagePermission("REBATE_VIEW");
  const [company, calculations] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: context.company.id } }),
    prisma.rebateCalculation.findMany({
      where: { companyId: context.company.id },
      include: { program: { select: { code: true, direction: true } }, supplier: { select: { name: true } }, customer: { select: { name: true } }, receivable: { select: { receivedAmount: true } }, payable: { select: { paidAmount: true } } },
      orderBy: [{ periodEnd: "desc" }],
      take: 300,
    }),
  ]);
  const currency = company.currencyCode;
  const receivable = calculations.filter((row) => row.program.direction === "RECEIVABLE");
  const payable = calculations.filter((row) => row.program.direction === "PAYABLE");
  const sum = (rows: typeof calculations, field: "approvedAmount" | "settledAmount" | "outstandingAmount") => rows.reduce((total, row) => total + Number(row[field]), 0);

  return <div className="mx-auto max-w-[1100px]">
    <div className="no-print mb-4 flex items-center justify-between rounded-xl border bg-white p-3">
      <div><p className="text-sm font-bold">Print preview · Rebate register</p><p className="text-xs text-slate-500">Supplier receivables and customer payables with accrual and settlement status.</p></div>
      <PrintButton label="Print register / save PDF" />
    </div>
    <article className="print-document min-h-[1000px] rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <header className="flex items-start justify-between border-b-2 border-blue-700 pb-5">
        <div className="flex gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-xl bg-blue-700 text-xl font-black text-white">{company.code.slice(0, 2)}</div>
          <div><h1 className="text-xl font-black uppercase">{company.legalName || company.name}</h1><p className="mt-1 text-xs text-slate-600">Rebate register · generated {date(new Date())}</p></div>
        </div>
        <div className="text-right text-xs"><div className="font-bold uppercase tracking-[.18em] text-blue-700">Rebates</div><div className="mt-1 text-lg font-black">{calculations.length} calculations</div></div>
      </header>
      <section className="print-break-avoid mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border p-3"><div className="text-[9px] font-bold uppercase text-slate-400">Supplier rebate receivable</div><div className="mt-1 text-sm font-black">{money({ toString: () => sum(receivable, "outstandingAmount").toFixed(4) }, currency)}</div><div className="mt-1 text-[9px] text-slate-500">{receivable.length} programs · settled {money({ toString: () => sum(receivable, "settledAmount").toFixed(4) }, currency)}</div></div>
        <div className="rounded-xl border p-3"><div className="text-[9px] font-bold uppercase text-slate-400">Customer rebate payable</div><div className="mt-1 text-sm font-black">{money({ toString: () => sum(payable, "outstandingAmount").toFixed(4) }, currency)}</div><div className="mt-1 text-[9px] text-slate-500">{payable.length} programs · settled {money({ toString: () => sum(payable, "settledAmount").toFixed(4) }, currency)}</div></div>
      </section>
      <table className="mt-5 w-full border-collapse text-[10px]">
        <thead><tr className="bg-blue-700 text-white"><th className="px-2 py-2 text-left">Reference</th><th className="px-2 py-2 text-left">Program</th><th className="px-2 py-2 text-left">Direction</th><th className="px-2 py-2 text-left">Party</th><th className="px-2 py-2 text-left">Period</th><th className="px-2 py-2 text-right">Approved</th><th className="px-2 py-2 text-right">Settled</th><th className="px-2 py-2 text-right">Outstanding</th><th className="px-2 py-2 text-left">Status</th></tr></thead>
        <tbody>{calculations.map((row) => <tr key={row.id} className="print-break-avoid border-b">
          <td className="px-2 py-2 font-bold">{row.referenceNumber}</td>
          <td className="px-2 py-2">{row.program.code}</td>
          <td className="px-2 py-2">{row.program.direction}</td>
          <td className="px-2 py-2">{row.supplier?.name ?? row.customer?.name ?? "—"}</td>
          <td className="px-2 py-2">{date(row.periodStart)} – {date(row.periodEnd)}</td>
          <td className="px-2 py-2 text-right">{money(row.approvedAmount, currency)}</td>
          <td className="px-2 py-2 text-right">{money(row.settledAmount, currency)}</td>
          <td className="px-2 py-2 text-right font-bold">{money(row.outstandingAmount, currency)}</td>
          <td className="px-2 py-2">{row.status}</td>
        </tr>)}</tbody>
      </table>
      {!calculations.length ? <p className="py-16 text-center text-xs text-slate-400">No rebate calculation recorded.</p> : null}
      <footer className="print-break-avoid mt-8 flex items-end justify-between border-t pt-4 text-[9px] leading-4 text-slate-500">
        <div>Eligibility derives from posted goods receipts (supplier) or posted sales net of returns (customer).</div>
        <div className="text-right">Generated {new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: company.timeZone }).format(new Date())}</div>
      </footer>
    </article>
  </div>;
}
