import { JournalStatus } from "@prisma/client";
import { JournalRegister } from "@/components/finance/journal-register";
import { permittedBranchIds, requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function JournalRegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await requirePagePermission("GL_VIEW");
  const params = await searchParams;
  const search = first(params.search)?.trim() || "";
  const statusValue = first(params.status) || "";
  const status = Object.values(JournalStatus).includes(statusValue as JournalStatus) ? (statusValue as JournalStatus) : undefined;
  const allowedBranchIds = permittedBranchIds(context, "GL_VIEW");
  const companyId = context.company.id;
  const branchWhere = allowedBranchIds ? { id: { in: allowedBranchIds } } : {};
  const [journals, accounts, branches, costCenters, departments] = await Promise.all([
    prisma.journalEntry.findMany({
      where: {
        companyId,
        ...(allowedBranchIds ? { branchId: { in: allowedBranchIds } } : {}),
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { voucherNumber: { contains: search, mode: "insensitive" } },
                { narration: { contains: search, mode: "insensitive" } },
                { referenceDocument: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        voucherNumber: true,
        postingDate: true,
        voucherType: true,
        status: true,
        narration: true,
        totalDebit: true,
        branch: { select: { code: true, name: true } },
        preparedBy: { select: { fullName: true } },
        _count: { select: { lines: true } },
      },
      orderBy: [{ postingDate: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.account.findMany({
      where: { companyId, isActive: true, allowManualJournal: true },
      select: {
        id: true,
        code: true,
        name: true,
        accountClass: true,
        bankAccounts: { where: { isActive: true }, select: { id: true }, take: 1 },
      },
      orderBy: { code: "asc" },
    }),
    prisma.branch.findMany({ where: { companyId, isActive: true, ...branchWhere }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.costCenter.findMany({ where: { companyId, isActive: true, ...(allowedBranchIds ? { OR: [{ branchId: null }, { branchId: { in: allowedBranchIds } }] } : {}) }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.department.findMany({ where: { companyId, isActive: true, ...(allowedBranchIds ? { OR: [{ branchId: null }, { branchId: { in: allowedBranchIds } }] } : {}) }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-[1600px]">
      <JournalRegister
        journals={jsonSafe(journals) as never}
        accounts={accounts.map((account) => ({
          id: account.id,
          code: account.code,
          name: account.name,
          accountClass: account.accountClass,
          bankAccountId: account.bankAccounts[0]?.id || null,
        }))}
        branches={branches}
        costCenters={costCenters}
        departments={departments}
        currency={context.company.currencyCode}
        canCreate={context.permissions.includes("JOURNAL_CREATE")}
        initialSearch={search}
        initialStatus={status || ""}
      />
    </div>
  );
}
