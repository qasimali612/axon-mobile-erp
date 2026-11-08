import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET() {
  try {
    const context = await requirePermission("INCENTIVE_VIEW");
    const companyId = context.company.id;
    const branches = permittedBranchIds(context, "INCENTIVE_VIEW");
    const branchScope = branches ? { in: branches } : undefined;
    const [plans, calculations, payables, received, branchList, accounts, methods, bankAccounts, suppliers] = await Promise.all([
      prisma.incentivePlan.findMany({
        where: { companyId, ...(branchScope ? { OR: [{ branchId: null }, { branchId: branchScope }] } : {}) },
        include: { branch: { select: { code: true, name: true } }, expenseAccount: { select: { code: true, name: true } }, payableAccount: { select: { code: true, name: true } }, _count: { select: { calculations: true, receivedIncentives: true } } },
        orderBy: [{ isActive: "desc" }, { code: "asc" }],
      }),
      prisma.incentiveCalculation.findMany({
        where: { companyId, ...(branchScope ? { branchId: branchScope } : {}) },
        include: {
          plan: { select: { code: true, name: true, incentiveType: true, recipientType: true, rate: true, fixedAmount: true, minimumTarget: true, maximumIncentive: true, expenseAccountId: true, payableAccountId: true } },
          branch: { select: { code: true, name: true } },
          recipientUser: { select: { fullName: true } },
          recipientCustomer: { select: { code: true, name: true } },
          calculatedBy: { select: { fullName: true } },
          approvedBy: { select: { fullName: true } },
          payable: { include: { payments: { orderBy: { paymentDate: "asc" }, select: { id: true, amount: true, paymentDate: true, paymentMethod: true, reference: true, journalEntry: { select: { voucherNumber: true } } } } } },
        },
        orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
        take: 300,
      }),
      prisma.incentivePayable.findMany({
        where: { companyId, status: { in: ["ACCRUED", "PARTIALLY_PAID"] }, ...(branchScope ? { calculation: { branchId: branchScope } } : {}) },
        include: { calculation: { select: { id: true, recipientName: true, periodStart: true, periodEnd: true, branchId: true, plan: { select: { code: true, name: true } } } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.receivedIncentive.findMany({
        where: { companyId },
        include: { supplier: { select: { code: true, name: true } }, preparedBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } }, accrualJournal: { select: { voucherNumber: true } }, payments: { select: { id: true, amount: true, receiptDate: true, receiptMethod: true, reference: true, journalEntry: { select: { voucherNumber: true } } } } },
        orderBy: [{ createdAt: "desc" }],
        take: 200,
      }),
      prisma.branch.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
      prisma.account.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true, accountClass: true, accountType: true }, orderBy: { code: "asc" } }),
      prisma.paymentMethod.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true, methodType: true, cashAccountId: true, bankAccountId: true, requiresReference: true }, orderBy: { sequence: "asc" } }),
      prisma.bankAccount.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, bankName: true, branchId: true, glAccount: { select: { code: true, name: true } } }, orderBy: { code: "asc" } }),
      prisma.supplier.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    ]);
    return NextResponse.json(jsonSafe({ data: { plans, calculations, payables, received }, lookups: { branches: branchList, accounts, paymentMethods: methods, bankAccounts, suppliers } }));
  } catch (error) { return apiError(error); }
}
