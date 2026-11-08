import { JournalStatus, Prisma } from "@prisma/client";
import { AccountCatalog } from "@/components/finance/account-catalog";
import { permittedBranchIds, requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export default async function ChartOfAccountsPage() {
  const context = await requirePagePermission("COA_VIEW");
  const companyId = context.company.id;
  const allowedBranches = permittedBranchIds(context, "COA_VIEW");
  const [accounts, groups, branches, costCenters, balances] = await Promise.all([
    prisma.account.findMany({
      where: { companyId, ...(allowedBranches ? { OR: [{ branchId: null }, { branchId: { in: allowedBranches } }] } : {}) },
      include: {
        group: { select: { code: true, name: true } },
        parent: { select: { code: true, name: true } },
        branch: { select: { code: true, name: true } },
        _count: { select: { journalLines: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.accountGroup.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true, accountClass: true }, orderBy: [{ sequence: "asc" }, { code: "asc" }] }),
    prisma.branch.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.costCenter.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.journalEntryLine.groupBy({
      by: ["accountId"],
      where: {
        entry: {
          companyId,
          status: { in: [JournalStatus.POSTED, JournalStatus.REVERSED] },
          ...(allowedBranches ? { branchId: { in: allowedBranches } } : {}),
        },
      },
      _sum: { baseDebit: true, baseCredit: true },
    }),
  ]);
  const balanceMap = new Map(
    balances.map((item) => [item.accountId, (item._sum.baseDebit || new Prisma.Decimal(0)).minus(item._sum.baseCredit || new Prisma.Decimal(0))]),
  );
  const rows = accounts.map((account) => {
    const raw = balanceMap.get(account.id) || new Prisma.Decimal(0);
    return { ...account, balance: (account.normalBalance === "CREDIT" ? raw.negated() : raw).toFixed(4) };
  });

  const canCreate = context.permissions.includes("COA_CREATE") && permittedBranchIds(context, "COA_CREATE") === null;
  const canEdit = context.permissions.includes("COA_EDIT") && permittedBranchIds(context, "COA_EDIT") === null;
  return <div className="mx-auto max-w-[1600px]"><AccountCatalog accounts={jsonSafe(rows) as never} groups={groups} branches={branches} costCenters={costCenters} currency={context.company.currencyCode} canCreate={canCreate} canEdit={canEdit} /></div>;
}
