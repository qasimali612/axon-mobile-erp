import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const base = await requireAuth();
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId");

    let terminals = await prisma.posTerminal.findMany({
      where: {
        companyId: base.company.id,
        isActive: true,
        ...(branchId ? { branchId } : {}),
      },
      include: {
        defaultCashAccount: true,
      },
      orderBy: { code: "asc" },
    });

    // Auto-bootstrap default terminal POS-01 if none exists for the company/branch
    if (terminals.length === 0 && branchId) {
      const defaultCashAccount = await prisma.account.findFirst({
        where: {
          companyId: base.company.id,
          accountType: "CASH",
          isActive: true,
          OR: [{ branchId }, { branchId: null }],
        },
      });

      const newTerminal = await prisma.posTerminal.create({
        data: {
          companyId: base.company.id,
          branchId,
          code: "POS-01",
          name: "Main Counter Terminal",
          defaultCashAccountId: defaultCashAccount?.id || null,
        },
        include: { defaultCashAccount: true },
      });
      terminals = [newTerminal];
    }

    return NextResponse.json(jsonSafe({ data: terminals }));
  } catch (error) {
    return apiError(error);
  }
}

