import { PrintButton } from "@/components/purchase/print-button";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const money = (value: { toString(): string } | number, currency: string) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(value.toString()));
const date = (value: Date | string | null) =>
  value ? new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";

type PrintPageProps = {
  searchParams: Promise<{ id?: string }>;
};

export default async function RebateRegisterPrintPage({ searchParams }: PrintPageProps) {
  const context = await requirePagePermission("REBATE_VIEW");
  const { id: calculationId } = await searchParams;

  const company = await prisma.company.findUniqueOrThrow({ where: { id: context.company.id } });
  const currency = company.currencyCode;

  if (calculationId) {
    const calc = await prisma.rebateCalculation.findFirst({
      where: { id: calculationId, companyId: context.company.id },
      include: {
        program: { select: { code: true, name: true, direction: true, calculationMethod: true } },
        supplier: { select: { code: true, name: true, phone: true, email: true, taxNumber: true } },
        customer: { select: { code: true, name: true, phone: true, email: true } },
        calculatedBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
        accrualJournal: { select: { voucherNumber: true } },
      },
    });

    if (!calc) {
      return (
        <div className="mx-auto max-w-[800px] p-8 text-center text-slate-500">
          Rebate calculation record not found.
        </div>
      );
    }

    const details = (calc.calculationDetails as Record<string, unknown>) || {};
    const items = Array.isArray(details.items) ? (details.items as Array<Record<string, unknown>>) : [];
    const isRateProtection = calc.program.calculationMethod === "PRICE_PROTECTION" || items.length > 0;

    return (
      <div className="mx-auto max-w-[1100px] p-4 font-sans">
        <div className="no-print mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div>
            <p className="text-sm font-bold text-slate-800">
              {isRateProtection ? "Supplier Rate Protection Claim" : "Rebate Claim Statement"} · Preview
            </p>
            <p className="text-xs text-slate-500">
              Reference: <span className="font-mono font-semibold">{calc.referenceNumber}</span> · Status: {calc.status}
            </p>
          </div>
          <PrintButton label="Print Claim / Save PDF" />
        </div>

        <article className="print-document min-h-[900px] rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-slate-900">
          <header className="flex items-start justify-between border-b-2 border-slate-900 pb-5">
            <div className="flex gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-blue-700 text-xl font-black text-white">
                {company.code.slice(0, 2)}
              </div>
              <div>
                <h1 className="text-xl font-black uppercase text-slate-900">{company.legalName || company.name}</h1>
                <p className="text-xs text-slate-600">Tax ID / NTN: {company.taxRegistrationNumber || "—"}</p>
                <p className="text-xs text-slate-500 mt-0.5">Official Supplier Rate Protection Claim & Settlement Voucher</p>
              </div>
            </div>
            <div className="text-right">
              <div className="inline-block rounded-md bg-blue-50 px-2.5 py-1 text-xs font-black tracking-wider text-blue-700 uppercase">
                {isRateProtection ? "Rate Protection Claim" : "Rebate Claim"}
              </div>
              <div className="mt-2 font-mono text-sm font-bold text-slate-800">{calc.referenceNumber}</div>
              <div className="text-xs text-slate-500">Date: {date(calc.createdAt)}</div>
            </div>
          </header>

          <section className="mt-6 grid grid-cols-2 gap-6 text-xs">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Supplier / Vendor</h3>
              <p className="mt-1 text-sm font-black text-slate-800">{calc.supplier?.name || "—"}</p>
              <p className="text-slate-600">Code: <span className="font-mono">{calc.supplier?.code || "—"}</span></p>
              {calc.supplier?.taxNumber ? <p className="text-slate-600">NTN: {calc.supplier.taxNumber}</p> : null}
              {calc.supplier?.phone ? <p className="text-slate-600">Phone: {calc.supplier.phone}</p> : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Program & Claim Period</h3>
              <p className="mt-1 text-sm font-black text-slate-800">{calc.program.name} ({calc.program.code})</p>
              <p className="text-slate-600">Effective Period: {date(calc.periodStart)} – {date(calc.periodEnd)}</p>
              <p className="text-slate-600">Accrual Journal: {calc.accrualJournal?.voucherNumber || "Pending Accrual"}</p>
              <p className="text-slate-600">Status: <span className="font-semibold text-blue-700">{calc.status}</span></p>
            </div>
          </section>

          <section className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-bold uppercase text-slate-400">Protected Inventory Qty</div>
              <div className="mt-1 text-lg font-black text-slate-800">{Number(calc.eligibleQuantity).toLocaleString()} units</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-bold uppercase text-slate-400">Original Stock Value</div>
              <div className="mt-1 text-lg font-black text-slate-800">{money(calc.eligibleValue, currency)}</div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3">
              <div className="text-[10px] font-bold uppercase text-blue-600">Total Rate Protection Claim</div>
              <div className="mt-1 text-lg font-black text-blue-700">{money(calc.calculatedAmount, currency)}</div>
            </div>
          </section>

          {isRateProtection && items.length > 0 ? (
            <section className="mt-6">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">Item-Wise Price Drop Breakdown</h3>
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-2 py-2 text-left">#</th>
                    <th className="px-2 py-2 text-left">Product / Model Description</th>
                    <th className="px-2 py-2 text-left">SKU</th>
                    <th className="px-2 py-2 text-right">Stock Qty</th>
                    <th className="px-2 py-2 text-right">Old Cost</th>
                    <th className="px-2 py-2 text-right">New Price</th>
                    <th className="px-2 py-2 text-right">Drop / Unit</th>
                    <th className="px-2 py-2 text-right">Claim Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                  {items.map((item, idx) => (
                    <tr key={idx} className="print-break-avoid hover:bg-slate-50/50">
                      <td className="px-2 py-2 text-slate-400">{idx + 1}</td>
                      <td className="px-2 py-2 font-medium text-slate-800">
                        {String(item.productName || item.name || "Item")}
                        {item.variantName && item.variantName !== item.productName ? (
                          <span className="block text-[9px] text-slate-500">{String(item.variantName)}</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 font-mono text-slate-600">{String(item.sku || "—")}</td>
                      <td className="px-2 py-2 text-right font-mono font-semibold text-slate-700">
                        {Number(item.eligibleQuantity || 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-600">{money(Number(item.oldPrice || 0), currency)}</td>
                      <td className="px-2 py-2 text-right font-mono text-slate-600">{money(Number(item.newPrice || 0), currency)}</td>
                      <td className="px-2 py-2 text-right font-mono font-bold text-amber-700">
                        {money(Number(item.priceDropPerUnit || 0), currency)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono font-black text-slate-900">
                        {money(Number(item.claimAmount || 0), currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold text-slate-900">
                    <td colSpan={3} className="px-2 py-2.5 text-right uppercase tracking-wider text-[9px]">Total Protected Inventory & Claim:</td>
                    <td className="px-2 py-2.5 text-right font-mono font-black">{Number(calc.eligibleQuantity).toLocaleString()}</td>
                    <td colSpan={3} className="px-2 py-2.5 text-right"></td>
                    <td className="px-2 py-2.5 text-right font-mono font-black text-blue-700 text-xs">{money(calc.calculatedAmount, currency)}</td>
                  </tr>
                </tfoot>
              </table>
            </section>
          ) : null}

          <section className="print-break-avoid mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4 text-[10px] text-slate-600 leading-relaxed">
            <p className="font-bold text-slate-800 uppercase tracking-wider text-[9px] mb-1">Commercial Price Protection Terms</p>
            <p>
              This Rate Protection Claim covers unsold inventory physical stock on hand at the announcement of the official supplier rate cut.
              The total claim amount of <strong>{money(calc.calculatedAmount, currency)}</strong> will be credited to our supplier ledger account
              or settled via credit memo / direct deduction against upcoming purchase shipments.
            </p>
          </section>

          <footer className="print-break-avoid mt-12 grid grid-cols-3 gap-8 pt-8 border-t border-slate-200 text-center text-xs">
            <div>
              <div className="h-14 border-b border-dashed border-slate-300"></div>
              <p className="mt-2 font-bold text-slate-800">{calc.calculatedBy?.fullName || "Claim Preparer"}</p>
              <p className="text-[10px] text-slate-500">Prepared by (Operations / Inventory)</p>
            </div>
            <div>
              <div className="h-14 border-b border-dashed border-slate-300"></div>
              <p className="mt-2 font-bold text-slate-800">{calc.approvedBy?.fullName || "Finance / Controller"}</p>
              <p className="text-[10px] text-slate-500">Verified & Approved by (Finance)</p>
            </div>
            <div>
              <div className="h-14 border-b border-dashed border-slate-300"></div>
              <p className="mt-2 font-bold text-slate-800">Supplier Representative</p>
              <p className="text-[10px] text-slate-500">Acknowledgment & Acceptance</p>
            </div>
          </footer>

          <div className="mt-8 text-center text-[9px] text-slate-400">
            © 2026 Copyright Reserved · Qasim Ali · 0315-5049489
          </div>
        </article>
      </div>
    );
  }

  // Full Register Print View
  const calculations = await prisma.rebateCalculation.findMany({
    where: { companyId: context.company.id },
    include: {
      program: { select: { code: true, direction: true, calculationMethod: true } },
      supplier: { select: { name: true } },
      customer: { select: { name: true } },
      receivable: { select: { receivedAmount: true } },
      payable: { select: { paidAmount: true } },
    },
    orderBy: [{ periodEnd: "desc" }],
    take: 300,
  });

  const receivable = calculations.filter((row) => row.program.direction === "RECEIVABLE");
  const payable = calculations.filter((row) => row.program.direction === "PAYABLE");
  const sum = (rows: typeof calculations, field: "approvedAmount" | "settledAmount" | "outstandingAmount") =>
    rows.reduce((total, row) => total + Number(row[field]), 0);

  return (
    <div className="mx-auto max-w-[1100px] p-4">
      <div className="no-print mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <p className="text-sm font-bold">Print preview · Rebate & Rate Protection Register</p>
          <p className="text-xs text-slate-500">Supplier receivables and customer payables with accrual and settlement status.</p>
        </div>
        <PrintButton label="Print register / save PDF" />
      </div>
      <article className="print-document min-h-[1000px] rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <header className="flex items-start justify-between border-b-2 border-blue-700 pb-5">
          <div className="flex gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-xl bg-blue-700 text-xl font-black text-white">
              {company.code.slice(0, 2)}
            </div>
            <div>
              <h1 className="text-xl font-black uppercase">{company.legalName || company.name}</h1>
              <p className="mt-1 text-xs text-slate-600">Rebate register · generated {date(new Date())}</p>
            </div>
          </div>
          <div className="text-right text-xs">
            <div className="font-bold uppercase tracking-[.18em] text-blue-700">Rebates & Claims</div>
            <div className="mt-1 text-lg font-black">{calculations.length} calculations</div>
          </div>
        </header>
        <section className="print-break-avoid mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl border p-3">
            <div className="text-[9px] font-bold uppercase text-slate-400">Supplier rebate / Rate Protection receivable</div>
            <div className="mt-1 text-sm font-black">{money({ toString: () => sum(receivable, "outstandingAmount").toFixed(4) }, currency)}</div>
            <div className="mt-1 text-[9px] text-slate-500">{receivable.length} programs · settled {money({ toString: () => sum(receivable, "settledAmount").toFixed(4) }, currency)}</div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-[9px] font-bold uppercase text-slate-400">Customer rebate payable</div>
            <div className="mt-1 text-sm font-black">{money({ toString: () => sum(payable, "outstandingAmount").toFixed(4) }, currency)}</div>
            <div className="mt-1 text-[9px] text-slate-500">{payable.length} programs · settled {money({ toString: () => sum(payable, "settledAmount").toFixed(4) }, currency)}</div>
          </div>
        </section>
        <table className="mt-5 w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-blue-700 text-white">
              <th className="px-2 py-2 text-left">Reference</th>
              <th className="px-2 py-2 text-left">Program</th>
              <th className="px-2 py-2 text-left">Method</th>
              <th className="px-2 py-2 text-left">Party</th>
              <th className="px-2 py-2 text-left">Period</th>
              <th className="px-2 py-2 text-right">Approved</th>
              <th className="px-2 py-2 text-right">Settled</th>
              <th className="px-2 py-2 text-right">Outstanding</th>
              <th className="px-2 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {calculations.map((row) => (
              <tr key={row.id} className="print-break-avoid border-b">
                <td className="px-2 py-2 font-bold">{row.referenceNumber}</td>
                <td className="px-2 py-2">{row.program.code}</td>
                <td className="px-2 py-2">{row.program.calculationMethod === "PRICE_PROTECTION" ? "Rate Protection" : row.program.direction}</td>
                <td className="px-2 py-2">{row.supplier?.name ?? row.customer?.name ?? "—"}</td>
                <td className="px-2 py-2">{date(row.periodStart)} – {date(row.periodEnd)}</td>
                <td className="px-2 py-2 text-right">{money(row.approvedAmount, currency)}</td>
                <td className="px-2 py-2 text-right">{money(row.settledAmount, currency)}</td>
                <td className="px-2 py-2 text-right font-bold">{money(row.outstandingAmount, currency)}</td>
                <td className="px-2 py-2">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!calculations.length ? <p className="py-16 text-center text-xs text-slate-400">No rebate calculation recorded.</p> : null}
        <footer className="print-break-avoid mt-8 flex items-end justify-between border-t pt-4 text-[9px] leading-4 text-slate-500">
          <div>Eligibility derives from posted goods receipts (supplier) or posted sales net of returns (customer) or rate protection price-drops.</div>
          <div className="text-right">Generated {new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: company.timeZone }).format(new Date())}</div>
        </footer>
      </article>
    </div>
  );
}
