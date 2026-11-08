import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET() {
  try {
    const context = await requirePermission("REBATE_VIEW");
    const companyId = context.company.id;
    const [programs, calculations, suppliers, customers, accounts, methods, bankAccounts] = await Promise.all([
      prisma.rebateProgram.findMany({
        where: { companyId },
        include: { supplier: { select: { code: true, name: true } }, customer: { select: { code: true, name: true } }, primaryAccount: { select: { code: true, name: true } }, settlementAccount: { select: { code: true, name: true } }, _count: { select: { calculations: true } } },
        orderBy: [{ isActive: "desc" }, { code: "asc" }],
      }),
      prisma.rebateCalculation.findMany({
        where: { companyId },
        include: {
          program: { select: { code: true, name: true, direction: true, calculationMethod: true, primaryAccountId: true, settlementAccountId: true } },
          supplier: { select: { code: true, name: true } },
          customer: { select: { code: true, name: true } },
          calculatedBy: { select: { fullName: true } },
          approvedBy: { select: { fullName: true } },
          receivable: { include: { receipts: { select: { id: true, amount: true, receiptDate: true, receiptMethod: true, reference: true, journalEntry: { select: { voucherNumber: true } } } } } },
          payable: { include: { payments: { select: { id: true, amount: true, paymentDate: true, paymentMethod: true, reference: true, journalEntry: { select: { voucherNumber: true } } } } } },
        },
        orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
        take: 300,
      }),
      prisma.supplier.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
      prisma.customer.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
      prisma.account.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true, accountClass: true }, orderBy: { code: "asc" } }),
      prisma.paymentMethod.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true, methodType: true, bankAccountId: true, requiresReference: true }, orderBy: { sequence: "asc" } }),
      prisma.bankAccount.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, bankName: true }, orderBy: { code: "asc" } }),
    ]);
    return NextResponse.json(jsonSafe({ data: { programs, calculations }, lookups: { suppliers, customers, accounts, paymentMethods: methods, bankAccounts } }));
  } catch (error) { return apiError(error); }
}
