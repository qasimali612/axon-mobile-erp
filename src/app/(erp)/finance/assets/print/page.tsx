import { PrintButton } from "@/components/purchase/print-button";
import { permittedBranchIds, requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const money = (value: { toString(): string }, currency: string) => new Intl.NumberFormat("en-PK", { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(value.toString()));
const date = (value: Date | null) => value ? new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", day: "2-digit", month: "short", year: "numeric" }).format(value) : "—";

export default async function FixedAssetRegisterPrintPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requirePagePermission("ASSET_VIEW");
  const params = await searchParams;
  const branchFilter = Array.isArray(params.branch) ? params.branch[0] : params.branch;
  const branches = permittedBranchIds(context, "ASSET_VIEW");
  const scope = branchFilter && (!branches || branches.includes(branchFilter)) ? [branchFilter] : branches ?? undefined;
  const [company, assets] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: context.company.id } }),
    prisma.fixedAsset.findMany({
      where: { companyId: context.company.id, ...(scope ? { branchId: { in: scope } } : {}) },
      include: { category: { select: { code: true, name: true } }, branch: { select: { code: true } }, custodian: { select: { fullName: true } } },
      orderBy: [{ category: { code: "asc" } }, { code: "asc" }],
    }),
  ]);
  const currency = company.currencyCode;
  const totals = assets.reduce((sum, asset) => ({
    cost: sum.cost + Number(asset.purchaseCost) + Number(asset.additionalCost),
    accumulated: sum.accumulated + Number(asset.accumulatedDepreciation),
    net: sum.net + Number(asset.netBookValue),
  }), { cost: 0, accumulated: 0, net: 0 });
  const groups = [...new Set(assets.map((asset) => `${asset.category.code} · ${asset.category.name}`))];

  return <div className="mx-auto max-w-[1100px]">
    <div className="no-print mb-4 flex items-center justify-between rounded-xl border bg-white p-3">
      <div><p className="text-sm font-bold">Print preview · Fixed-asset register</p><p className="text-xs text-slate-500">Every asset with cost, accumulated depreciation, net book value and current status.</p></div>
      <PrintButton label="Print register / save PDF" />
    </div>
    <article className="print-document min-h-[1100px] rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <header className="flex items-start justify-between border-b-2 border-blue-700 pb-5">
        <div className="flex gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-xl bg-blue-700 text-xl font-black text-white">{company.code.slice(0, 2)}</div>
          <div><h1 className="text-xl font-black uppercase">{company.legalName || company.name}</h1><p className="mt-1 text-xs text-slate-600">Fixed-asset register · as at {date(new Date())}</p></div>
        </div>
        <div className="text-right text-xs"><div className="font-bold uppercase tracking-[.18em] text-blue-700">Register</div><div className="mt-1 text-lg font-black">{assets.length} assets</div></div>
      </header>
      <section className="print-break-avoid mt-4 grid grid-cols-3 gap-3 text-xs">
        <div className="rounded-xl border p-3"><div className="text-[9px] font-bold uppercase text-slate-400">Total cost</div><div className="mt-1 text-sm font-black">{money({ toString: () => totals.cost.toFixed(4) }, currency)}</div></div>
        <div className="rounded-xl border p-3"><div className="text-[9px] font-bold uppercase text-slate-400">Accumulated depreciation</div><div className="mt-1 text-sm font-black">{money({ toString: () => totals.accumulated.toFixed(4) }, currency)}</div></div>
        <div className="rounded-xl border p-3"><div className="text-[9px] font-bold uppercase text-slate-400">Net book value</div><div className="mt-1 text-sm font-black">{money({ toString: () => totals.net.toFixed(4) }, currency)}</div></div>
      </section>
      {groups.map((group) => <section key={group} className="mt-5">
        <h2 className="mb-1 text-xs font-black uppercase tracking-wider text-blue-800">{group}</h2>
        <table className="w-full border-collapse text-[10px]">
          <thead><tr className="bg-slate-100 text-left"><th className="px-2 py-2">Asset</th><th className="px-2 py-2">Name / serial</th><th className="px-2 py-2">Branch</th><th className="px-2 py-2">Custodian</th><th className="px-2 py-2 text-right">Cost</th><th className="px-2 py-2 text-right">Accumulated</th><th className="px-2 py-2 text-right">Net book</th><th className="px-2 py-2">Status</th></tr></thead>
          <tbody>{assets.filter((asset) => `${asset.category.code} · ${asset.category.name}` === group).map((asset) => <tr key={asset.id} className="print-break-avoid border-b">
            <td className="px-2 py-2 font-bold">{asset.code}</td>
            <td className="px-2 py-2">{asset.name}{asset.serialNumber ? <span className="block font-mono text-[8px] text-slate-500">{asset.serialNumber}</span> : null}</td>
            <td className="px-2 py-2">{asset.branch.code}</td>
            <td className="px-2 py-2">{asset.custodian?.fullName ?? "—"}</td>
            <td className="px-2 py-2 text-right">{money(asset.purchaseCost.plus(asset.additionalCost), currency)}</td>
            <td className="px-2 py-2 text-right">{money(asset.accumulatedDepreciation, currency)}</td>
            <td className="px-2 py-2 text-right font-bold">{money(asset.netBookValue, currency)}</td>
            <td className="px-2 py-2">{asset.status}</td>
          </tr>)}</tbody>
        </table>
      </section>)}
      {!assets.length ? <p className="py-16 text-center text-xs text-slate-400">No fixed asset is registered for this scope.</p> : null}
      <footer className="print-break-avoid mt-8 flex items-end justify-between border-t pt-4 text-[9px] leading-4 text-slate-500">
        <div>{scope ? "Scope limited to authorized branches." : "Company-wide register."} Disposed assets remain in the register with zero net book value for audit.</div>
        <div className="text-right"><div>Generated {new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: company.timeZone }).format(new Date())}</div><div>Assets counted: {assets.length}</div></div>
      </footer>
    </article>
  </div>;
}
