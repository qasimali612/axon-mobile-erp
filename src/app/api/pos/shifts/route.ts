import { NextResponse } from "next/server";
import { apiError, ApiError } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { openPosShift, type PosShiftOpenInput } from "@/lib/operations/pos";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const base = await requireAuth();
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId");
    const terminalId = searchParams.get("terminalId");
    const status = searchParams.get("status") as "OPEN" | "CLOSED" | null;

    const shifts = await prisma.posShift.findMany({
      where: {
        companyId: base.company.id,
        ...(branchId ? { branchId } : {}),
        ...(terminalId ? { terminalId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        terminal: true,
        cashier: { select: { id: true, fullName: true } },
      },
      orderBy: { openedAt: "desc" },
      take: 50,
    });

    return NextResponse.json(jsonSafe({ data: shifts }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const base = await requireAuth();
    const body = (await request.json().catch(() => null)) as PosShiftOpenInput | null;
    if (!body || typeof body !== "object") {
      throw new ApiError(400, "BAD_REQUEST", "A JSON request body is required.");
    }
    if (!body.branchId || !body.terminalId) {
      throw new ApiError(422, "MISSING_REQUIRED_FIELDS", "branchId and terminalId are required.");
    }

    const context = await requirePermission("SALES_INVOICE_CREATE", { branchId: body.branchId });
    const actor = {
      companyId: context.company.id,
      userId: context.user.id,
      currencyCode: context.company.currencyCode,
      permissions: context.permissions,
    };

    const shift = await openPosShift(actor, {
      ...body,
      openingFloat: String(body.openingFloat || "0"),
    });
    return NextResponse.json(jsonSafe({ data: shift }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

