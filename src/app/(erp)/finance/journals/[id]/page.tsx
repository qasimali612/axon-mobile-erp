import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, FileLock2, Link2, UserRoundCheck } from "lucide-react";
import { JournalActions } from "@/components/finance/journal-actions";
import { Badge } from "@/components/ui/badge";
import { permittedBranchIds, requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

type Params = Promise<{ id: string }>;

function tone(status: string): "green" | "amber" | "red" | "slate" {
  if (status === "POSTED") return "green";
  if (status === "SUBMITTED" || status === "APPROVED") return "amber";
  if (status === "REVERSED" || status === "REJECTED") return "red";
  return "slate";
}

export default async function JournalDetailPage({ params }: { params: Params }) {
  const context = await requirePagePermission("GL_VIEW");
  const id = (await params).id;
  const journal = await prisma.journalEntry.findFirst({
    where: { id, companyId: context.company.id },
    include: {
      branch: { select: { code: true, name: true } },
      period: { include: { fiscalYear: { select: { code: true, name: true } } } },
      costCenter: { select: { code: true, name: true } },
      department: { select: { code: true, name: true } },
      preparedBy: { select: { id: true, fullName: true, email: true } },
      approvedBy: { select: { id: true, fullName: true, email: true } },
      postedBy: { select: { id: true, fullName: true, email: true } },
      reversedBy: { select: { id: true, fullName: true, email: true } },
      reversalOf: { select: { id: true, voucherNumber: true } },
      reversals: { select: { id: true, voucherNumber: true, status: true } },
      lines: {
        include: {
          account: { select: { code: true, name: true, accountClass: true } },
          customer: { select: { code: true, name: true } },
          supplier: { select: { code: true, name: true } },
          bankAccount: { select: { code: true, bankName: true, accountNumberLast4: true } },
          salesperson: { select: { fullName: true } },
          costCenter: { select: { code: true, name: true } },
          department: { select: { code: true, name: true } },
        },
        orderBy: { lineNumber: "asc" },
      },
    },
  });
  if (!journal) notFound();
  const allowedBranches = permittedBranchIds(context, "GL_VIEW");
  if (allowedBranches && !allowedBranches.includes(journal.branchId)) redirect("/unauthorized");
  const currency = context.company.currencyCode;
  const steps = [
    { label: "Prepared", complete: true, person: journal.preparedBy.fullName, at: journal.createdAt },
    { label: "Approved", complete: Boolean(journal.approvedAt), person: journal.approvedBy?.fullName, at: journal.approvedAt },
    { label: "Posted", complete: Boolean(journal.postedAt), person: journal.postedBy?.fullName, at: journal.postedAt },
    { label: "Reversed", complete: Boolean(journal.reversedAt), person: journal.reversedBy?.fullName, at: journal.reversedAt },
  ];

  return (
    <div className="mx-auto max-w-[1500px]">
      <Link href="/finance/journals" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-forest-700"><ArrowLeft className="h-3.5 w-3.5" />Journal register</Link>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><div className="mb-2 flex items-center gap-2"><span className="kicker">{titleCase(journal.voucherType)}</span><Badge tone={tone(journal.status)}>{titleCase(journal.status)}</Badge>{journal.status === "POSTED" || journal.status === "REVERSED" ? <Badge tone="slate"><FileLock2 className="mr-1 h-3 w-3" />Immutable</Badge> : null}</div><h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">{journal.voucherNumber}</h1><p className="mt-1.5 text-sm text-slate-500">{journal.narration}</p></div><JournalActions id={journal.id} status={journal.status} permissions={context.permissions} /></div>

      <section className="surface mb-5 grid gap-px overflow-hidden bg-slate-100 sm:grid-cols-2 lg:grid-cols-4"><Info label="Posting date" value={formatDate(journal.postingDate)} /><Info label="Voucher date" value={formatDate(journal.voucherDate)} /><Info label="Branch" value={`${journal.branch.code} · ${journal.branch.name}`} /><Info label="Period" value={`${journal.period.name} · ${journal.period.fiscalYear.code}`} /><Info label="Reference" value={journal.referenceDocument || "—"} /><Info label="Source module" value={titleCase(journal.sourceModule)} /><Info label="Cost center" value={journal.costCenter ? `${journal.costCenter.code} · ${journal.costCenter.name}` : "—"} /><Info label="Department" value={journal.department ? `${journal.department.code} · ${journal.department.name}` : "—"} /></section>

      <section className="surface overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-bold text-slate-900">Journal lines</h2><p className="mt-1 text-[11px] text-slate-400">Base-currency debit and credit amounts from the protected ledger.</p></div><span className="text-[10px] font-semibold text-slate-400">{journal.lines.length} lines · {currency}</span></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left"><thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">#</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Description / dimensions</th><th className="px-4 py-3">Party / bank</th><th className="px-4 py-3 text-right">Debit</th><th className="px-5 py-3 text-right">Credit</th></tr></thead><tbody className="divide-y divide-slate-100">{journal.lines.map((line) => <tr key={line.id} className="align-top text-xs"><td className="px-5 py-3.5 text-slate-400">{line.lineNumber}</td><td className="px-4 py-3.5"><span className="font-bold text-slate-800">{line.account.code}</span><span className="mt-0.5 block text-[10px] text-slate-500">{line.account.name}</span><span className="mt-1 block text-[9px] uppercase tracking-wide text-slate-400">{titleCase(line.account.accountClass)}</span></td><td className="px-4 py-3.5"><span className="text-slate-700">{line.description}</span>{line.costCenter || line.department || line.salesperson ? <span className="mt-1.5 block text-[10px] text-slate-400">{[line.costCenter?.code, line.department?.code, line.salesperson?.fullName].filter(Boolean).join(" · ")}</span> : null}{line.invoiceNumber ? <span className="mt-1 block text-[10px] text-slate-400">Invoice {line.invoiceNumber}{line.dueDate ? ` · due ${formatDate(line.dueDate)}` : ""}</span> : null}</td><td className="px-4 py-3.5 text-[10px] text-slate-500">{line.customer ? <span className="block">Customer · {line.customer.code}<br />{line.customer.name}</span> : null}{line.supplier ? <span className="block">Supplier · {line.supplier.code}<br />{line.supplier.name}</span> : null}{line.bankAccount ? <span className="block">{line.bankAccount.code} · {line.bankAccount.bankName}<br />•••• {line.bankAccount.accountNumberLast4}</span> : null}{!line.customer && !line.supplier && !line.bankAccount ? "—" : null}</td><td className="px-4 py-3.5 text-right font-semibold tabular-nums text-slate-800">{line.baseDebit.isZero() ? "—" : formatMoney(line.baseDebit.toString(), currency)}</td><td className="px-5 py-3.5 text-right font-semibold tabular-nums text-slate-800">{line.baseCredit.isZero() ? "—" : formatMoney(line.baseCredit.toString(), currency)}</td></tr>)}</tbody><tfoot className="border-t-2 border-slate-200 bg-slate-50 text-sm font-bold text-slate-900"><tr><td colSpan={4} className="px-5 py-4 text-right text-[10px] uppercase tracking-wider text-slate-500">Balanced totals</td><td className="px-4 py-4 text-right tabular-nums">{formatMoney(journal.totalDebit.toString(), currency)}</td><td className="px-5 py-4 text-right tabular-nums">{formatMoney(journal.totalCredit.toString(), currency)}</td></tr></tfoot></table></div></section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <section className="surface overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-900">Workflow custody</h2><p className="mt-1 text-[11px] text-slate-400">Maker, checker, poster, and reversal identities are retained separately.</p></div><div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">{steps.map((step, index) => <div key={step.label} className={`rounded-xl border p-3 ${step.complete ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-slate-50"}`}><div className="flex items-center justify-between">{step.complete ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />}<span className="text-[9px] font-bold text-slate-400">0{index + 1}</span></div><p className="mt-3 text-xs font-bold text-slate-800">{step.label}</p><p className="mt-1 truncate text-[10px] text-slate-500">{step.person || "Pending"}</p><p className="mt-0.5 text-[9px] text-slate-400">{step.at ? formatDate(step.at, true) : "—"}</p></div>)}</div></section>
        <section className="surface overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-forest-700" /><h2 className="text-sm font-bold text-slate-900">Source traceability</h2></div><p className="mt-1 text-[11px] text-slate-400">Origin and reversal links cannot be silently replaced after posting.</p></div><div className="space-y-3 p-5">{journal.sourceDocumentNumber ? <Trace label="Source document" value={journal.sourceDocumentNumber} detail={`${journal.sourceDocumentType || "Record"} · ${journal.sourceDocumentId || "reference only"}`} /> : <Trace label="Source document" value={journal.referenceDocument || "Manual journal"} detail={titleCase(journal.sourceModule)} />}{journal.reversalOf ? <Link href={`/finance/journals/${journal.reversalOf.id}`} className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3"><span><span className="block text-[9px] font-bold uppercase tracking-wider text-red-600">Reverses</span><span className="mt-1 block text-xs font-bold text-red-900">{journal.reversalOf.voucherNumber}</span></span><ArrowRight className="h-4 w-4 text-red-600" /></Link> : null}{journal.reversals.map((reversal) => <Link key={reversal.id} href={`/finance/journals/${reversal.id}`} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 hover:border-forest-300"><span><span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Reversal voucher</span><span className="mt-1 block text-xs font-bold text-slate-800">{reversal.voucherNumber}</span></span><ArrowRight className="h-4 w-4 text-slate-400" /></Link>)}</div></section>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="bg-white px-5 py-4"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1.5 truncate text-xs font-semibold text-slate-800">{value}</p></div>;
}

function Trace({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-slate-200 p-3"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><UserRoundCheck className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</span><span className="mt-1 block truncate text-xs font-bold text-slate-800">{value}</span><span className="mt-0.5 block truncate text-[10px] text-slate-400">{detail}</span></span></div></div>;
}
