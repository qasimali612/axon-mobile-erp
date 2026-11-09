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
        receivable: {
          include: {
            receipts: {
              select: { id: true, amount: true, receiptDate: true, receiptMethod: true, reference: true, journalEntry: { select: { voucherNumber: true } } },
            },
          },
        },
        payable: {
          include: {
            payments: {
              select: { id: true, amount: true, paymentDate: true, paymentMethod: true, reference: true, journalEntry: { select: { voucherNumber: true } } },
            },
          },
        },
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
    const isRateProtection = ["PRICE_PROTECTION", "COMPANY_PRICE_REDUCTION"].includes(calc.program.calculationMethod) || items.length > 0;
    const isReceivable = calc.program.direction === "RECEIVABLE";
    const partyName = isReceivable ? calc.supplier?.name || "Supplier" : calc.customer?.name || "Customer";
    const partyCode = isReceivable ? calc.supplier?.code : calc.customer?.code;

    // Collect all IMEIs
    const allImeis: Array<{ sku: string; model: string; imei1: string; imei2?: string; serial?: string }> = [];
    for (const item of items) {
      if (Array.isArray(item.imeis)) {
        for (const im of item.imeis as any[]) {
          allImeis.push({
            sku: String(item.sku || ""),
            model: String(item.productName || item.model || ""),
            imei1: im.imei1 || im.value || "—",
            imei2: im.imei2 || undefined,
            serial: im.serialNumber || im.serial || undefined,
          });
        }
      }
    }

    const settlements = isReceivable ? calc.receivable?.receipts || [] : calc.payable?.payments || [];

    return (
      <div className="mx-auto max-w-[1100px] p-4 font-sans">
        <div className="no-print mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div>
            <p className="text-sm font-bold text-slate-800">
              {isRateProtection ? "Official Price Protection Claim Voucher" : "Rebate Claim Statement"} · Preview
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
                <p className="text-xs text-slate-500 mt-0.5">
                  {isReceivable
                    ? "Official Manufacturer / Supplier Rate Protection Claim & Settlement Voucher"
                    : "Customer / Dealer Price Protection Compensation Voucher"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="inline-block rounded-md bg-blue-50 px-2.5 py-1 text-xs font-black tracking-wider text-blue-700 uppercase">
                {isRateProtection ? "Price Protection Claim" : "Rebate Claim"}
              </div>
              <div className="mt-2 font-mono text-sm font-bold text-slate-800">{calc.referenceNumber}</div>
              <div className="text-xs text-slate-500">Claim Date: {date(calc.createdAt)}</div>
            </div>
          </header>

          <section className="mt-6 grid grid-cols-2 gap-6 text-xs">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {isReceivable ? "Supplier / Manufacturer" : "Customer / Dealer"}
              </h3>
              <p className="mt-1 text-sm font-black text-slate-800">{partyName}</p>
              <p className="text-slate-600">Party Code: <span className="font-mono">{partyCode || "—"}</span></p>
              {calc.supplier?.taxNumber ? <p className="text-slate-600">Tax Number: {calc.supplier.taxNumber}</p> : null}
              {calc.supplier?.phone || calc.customer?.phone ? <p className="text-slate-600">Contact: {calc.supplier?.phone || calc.customer?.phone}</p> : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Program & Claim Information</h3>
              <p className="mt-1 text-sm font-black text-slate-800">{calc.program.name} ({calc.program.code})</p>
              <p className="text-slate-600">Period: {date(calc.periodStart)} – {date(calc.periodEnd)}</p>
              <p className="text-slate-600">Accrual Journal: {calc.accrualJournal?.voucherNumber || "Pending Accrual"}</p>
              <p className="text-slate-600">Current Status: <span className="font-semibold text-blue-700">{calc.status}</span></p>
            </div>
          </section>

          <section className="mt-4 grid grid-cols-4 gap-3 text-center">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-bold uppercase text-slate-400">Eligible Stock Qty</div>
              <div className="mt-1 text-lg font-black text-slate-800">{Number(calc.eligibleQuantity).toLocaleString()} units</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-bold uppercase text-slate-400">Claim Amount</div>
              <div className="mt-1 text-lg font-black text-slate-800">{money(calc.calculatedAmount, currency)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-bold uppercase text-emerald-600">Settled to Date</div>
              <div className="mt-1 text-lg font-black text-emerald-700">{money(calc.settledAmount, currency)}</div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3">
              <div className="text-[10px] font-bold uppercase text-blue-600">Remaining Balance</div>
              <div className="mt-1 text-lg font-black text-blue-700">{money(calc.outstandingAmount, currency)}</div>
            </div>
          </section>

          {isRateProtection && items.length > 0 ? (
            <section className="mt-6">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">Item-Wise Price Difference & Rate Protection Breakdown</h3>
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-2 py-2 text-left">#</th>
                    <th className="px-2 py-2 text-left">Product / Model Description</th>
                    <th className="px-2 py-2 text-left">SKU</th>
                    <th className="px-2 py-2 text-right">Old Price</th>
                    <th className="px-2 py-2 text-right">New Price</th>
                    <th className="px-2 py-2 text-right">Price Drop</th>
                    <th className="px-2 py-2 text-right">Eligible Qty</th>
                    <th className="px-2 py-2 text-right">Claim Qty</th>
                    <th className="px-2 py-2 text-right">Total Claim</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                  {items.map((item, idx) => (
                    <tr key={idx} className="print-break-avoid hover:bg-slate-50/50">
                      <td className="px-2 py-2 text-slate-400">{idx + 1}</td>
                      <td className="px-2 py-2 font-medium text-slate-800">
                        {String(item.productName || item.model || "Item")}
                        {item.variantName && item.variantName !== item.productName ? (
                          <span className="block text-[9px] text-slate-500">{String(item.variantName)}</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 font-mono text-slate-600">{String(item.sku || "—")}</td>
                      <td className="px-2 py-2 text-right font-mono text-slate-600">{money(Number(item.oldPrice || 0), currency)}</td>
                      <td className="px-2 py-2 text-right font-mono text-slate-600">{money(Number(item.newPrice || 0), currency)}</td>
                      <td className="px-2 py-2 text-right font-mono font-bold text-amber-700">{money(Number(item.priceDropPerUnit || item.priceDrop || 0), currency)}</td>
                      <td className="px-2 py-2 text-right font-mono text-slate-600">{Number(item.eligibleQuantity || 0).toLocaleString()}</td>
                      <td className="px-2 py-2 text-right font-mono font-bold text-slate-800">{Number(item.claimedQuantity || item.eligibleQuantity || 0).toLocaleString()}</td>
                      <td className="px-2 py-2 text-right font-mono font-bold text-blue-700">{money(Number(item.claimAmount || 0), currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {allImeis.length > 0 ? (
            <section className="mt-6">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                Verified Serial / IMEI Device Register ({allImeis.length} units · Deduplicated 1 handset = 1 unit)
              </h3>
              <table className="w-full border-collapse text-[9px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="px-2 py-1 text-left">#</th>
                    <th className="px-2 py-1 text-left">SKU</th>
                    <th className="px-2 py-1 text-left">Model</th>
                    <th className="px-2 py-1 text-left">Primary IMEI (IMEI 1)</th>
                    <th className="px-2 py-1 text-left">Secondary IMEI (IMEI 2)</th>
                    <th className="px-2 py-1 text-left">Serial Number</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {allImeis.slice(0, 150).map((im, idx) => (
                    <tr key={idx} className="print-break-avoid">
                      <td className="px-2 py-1 text-slate-400">{idx + 1}</td>
                      <td className="px-2 py-1 font-mono text-slate-600">{im.sku}</td>
                      <td className="px-2 py-1 text-slate-800">{im.model}</td>
                      <td className="px-2 py-1 font-mono font-bold text-slate-900">{im.imei1}</td>
                      <td className="px-2 py-1 font-mono text-slate-600">{im.imei2 || "—"}</td>
                      <td className="px-2 py-1 font-mono text-slate-500">{im.serial || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {allImeis.length > 150 ? (
                <p className="mt-1 text-[9px] text-slate-500 italic">Showing first 150 serial numbers of {allImeis.length}.</p>
              ) : null}
            </section>
          ) : null}

          {settlements.length > 0 ? (
            <section className="mt-6">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">Settlement & Receipt History</h3>
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="px-2 py-1 text-left">Date</th>
                    <th className="px-2 py-1 text-left">Method</th>
                    <th className="px-2 py-1 text-left">Reference</th>
                    <th className="px-2 py-1 text-left">Voucher #</th>
                    <th className="px-2 py-1 text-right">Settled Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {settlements.map((s: any, idx: number) => (
                    <tr key={idx} className="print-break-avoid">
                      <td className="px-2 py-1">{date(s.receiptDate || s.paymentDate)}</td>
                      <td className="px-2 py-1 font-semibold">{s.receiptMethod || s.paymentMethod}</td>
                      <td className="px-2 py-1 font-mono text-slate-600">{s.reference || "—"}</td>
                      <td className="px-2 py-1 font-mono">{s.journalEntry?.voucherNumber || "—"}</td>
                      <td className="px-2 py-1 text-right font-mono font-bold text-emerald-700">{money(s.amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <div className="mt-12 grid grid-cols-3 gap-6 pt-6 border-t text-center text-xs text-slate-600">
            <div>
              <div className="h-12 border-b border-dashed border-slate-300"></div>
              <p className="mt-2 font-semibold">Prepared By</p>
              <p className="text-[10px] text-slate-400">{calc.calculatedBy?.fullName || "Inventory Controller"}</p>
            </div>
            <div>
              <div className="h-12 border-b border-dashed border-slate-300"></div>
              <p className="mt-2 font-semibold">Authorized Approver</p>
              <p className="text-[10px] text-slate-400">{calc.approvedBy?.fullName || "Financial Controller"}</p>
            </div>
            <div>
              <div className="h-12 border-b border-dashed border-slate-300"></div>
              <p className="mt-2 font-semibold">Company / Supplier Acknowledgement</p>
              <p className="text-[10px] text-slate-400">Stamp & Signature</p>
            </div>
          </div>

          <footer className="mt-8 border-t pt-4 flex items-center justify-between text-[9px] text-slate-500">
            <div>
              Generated on {new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: company.timeZone }).format(new Date())}
            </div>
            <div className="font-semibold text-slate-600">
              © 2026 Copyright Reserved · Qasim Ali · 0315-5049489
            </div>
          </footer>
        </article>
      </div>
    );
  }

  // General Register Print
  const [programs, calculations] = await Promise.all([
    prisma.rebateProgram.findMany({
      where: { companyId: context.company.id },
      include: { supplier: { select: { name: true } }, customer: { select: { name: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.rebateCalculation.findMany({
      where: { companyId: context.company.id },
      include: {
        program: { select: { code: true, name: true, direction: true, calculationMethod: true } },
        supplier: { select: { name: true } },
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const sum = (rows: Array<Record<string, unknown>>, field: string) =>
    rows.reduce((acc, row) => acc + Number((row as Record<string, { toString(): string }>)[field]?.toString?.() ?? 0), 0);
  const receivable = calculations.filter((row) => row.program.direction === "RECEIVABLE");
  const payable = calculations.filter((row) => row.program.direction === "PAYABLE");

  return (
    <div className="mx-auto max-w-[1100px] p-4 font-sans">
      <div className="no-print mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div>
          <p className="text-sm font-bold text-slate-800">Rebate & Price Protection Master Register</p>
          <p className="text-xs text-slate-500">{programs.length} programs · {calculations.length} claim calculations</p>
        </div>
        <PrintButton label="Print Register / PDF" />
      </div>

      <article className="print-document min-h-[900px] rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-slate-900">
        <header className="flex items-start justify-between border-b-2 border-slate-900 pb-5">
          <div className="flex gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-xl bg-blue-700 text-xl font-black text-white">
              {company.code.slice(0, 2)}
            </div>
            <div>
              <h1 className="text-xl font-black uppercase text-slate-900">{company.legalName || company.name}</h1>
              <p className="text-xs text-slate-600">Tax ID: {company.taxRegistrationNumber || "—"}</p>
              <p className="text-xs text-slate-500 mt-0.5">Master Rebate, Price Protection, and Settlement Register</p>
            </div>
          </div>
          <div className="text-right">
            <div className="inline-block rounded-md bg-blue-50 px-2.5 py-1 text-xs font-black tracking-wider text-blue-700 uppercase">
              Official Register
            </div>
            <div className="mt-2 text-xs text-slate-500">Currency: {currency}</div>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-4">
          <div className="rounded-xl border p-3">
            <div className="text-[9px] font-bold uppercase text-slate-400">Supplier rebate receivable</div>
            <div className="mt-1 text-sm font-black">{money(sum(receivable, "outstandingAmount"), currency)}</div>
            <div className="mt-1 text-[9px] text-slate-500">{receivable.length} claims · settled {money(sum(receivable, "settledAmount"), currency)}</div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-[9px] font-bold uppercase text-slate-400">Customer rebate payable</div>
            <div className="mt-1 text-sm font-black">{money(sum(payable, "outstandingAmount"), currency)}</div>
            <div className="mt-1 text-[9px] text-slate-500">{payable.length} claims · settled {money(sum(payable, "settledAmount"), currency)}</div>
          </div>
        </section>

        <table className="mt-5 w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-slate-800 text-white">
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
              <tr key={row.id} className="print-break-avoid border-b hover:bg-slate-50/50">
                <td className="px-2 py-2 font-bold font-mono">{row.referenceNumber}</td>
                <td className="px-2 py-2">{row.program.code}</td>
                <td className="px-2 py-2">{row.program.calculationMethod === "PRICE_PROTECTION" ? "Price Protection" : row.program.direction}</td>
                <td className="px-2 py-2">{row.supplier?.name ?? row.customer?.name ?? "—"}</td>
                <td className="px-2 py-2">{date(row.periodStart)} – {date(row.periodEnd)}</td>
                <td className="px-2 py-2 text-right">{money(row.approvedAmount, currency)}</td>
                <td className="px-2 py-2 text-right text-emerald-700">{money(row.settledAmount, currency)}</td>
                <td className="px-2 py-2 text-right font-bold text-blue-700">{money(row.outstandingAmount, currency)}</td>
                <td className="px-2 py-2 font-semibold">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {!calculations.length ? <p className="py-16 text-center text-xs text-slate-400">No rebate calculations recorded.</p> : null}

        <footer className="print-break-avoid mt-8 flex items-end justify-between border-t pt-4 text-[9px] leading-4 text-slate-500">
          <div>Eligibility derived from posted goods receipts (supplier) or posted sales net of returns (customer) and stock price-protection drop.</div>
          <div className="text-right font-semibold text-slate-600">
            © 2026 Copyright Reserved · Qasim Ali · 0315-5049489
          </div>
        </footer>
      </article>
    </div>
  );
}
