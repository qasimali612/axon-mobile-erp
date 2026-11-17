import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { supplierDraftSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";
import { syncPartyOpeningBalance } from "@/lib/finance/party-opening-balance";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const context = await requirePermission("supplier.manage");
    const { id } = await params;
    idSchema.parse(id);

    const supplier = await prisma.supplier.findFirst({
      where: { id, companyId: context.company.id },
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
    });

    if (!supplier) {
      throw new ApiError(404, "NOT_FOUND", "Supplier not found.");
    }

    const payable = await prisma.account.findFirst({
      where: { companyId: context.company.id, accountType: "ACCOUNTS_PAYABLE", isActive: true },
      select: { id: true },
    });
    let outstanding = "0.0000";
    if (payable) {
      const rows = await prisma.$queryRaw<Array<{ balance: Prisma.Decimal }>>(Prisma.sql`
        SELECT COALESCE(SUM(l."baseCredit" - l."baseDebit"),0)::numeric(19,4) AS balance
        FROM "JournalEntryLine" l JOIN "JournalEntry" j ON j."id" = l."entryId"
        WHERE j."companyId" = ${context.company.id}::uuid AND j."status" = 'POSTED'
          AND l."accountId" = ${payable.id}::uuid AND l."supplierId" = ${id}::uuid
      `);
      outstanding = (rows[0]?.balance || new Prisma.Decimal(0)).toFixed(4);
    }

    return NextResponse.json(jsonSafe({ data: { ...supplier, outstanding } }));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    idSchema.parse(id);
    const body = supplierDraftSchema.parse(await request.json());
    const context = await requirePermission("supplier.manage", { branchId: body.branchId });

    const existing = await prisma.supplier.findFirst({
      where: { id, companyId: context.company.id },
    });

    if (!existing) {
      throw new ApiError(404, "NOT_FOUND", "Supplier not found.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.supplier.update({
        where: { id },
        data: {
          branchId: body.branchId || null,
          code: body.code,
          name: body.name,
          contactPerson: body.contactPerson || null,
          phone: body.phone || null,
          email: body.email || null,
          address: body.address || null,
          taxNumber: body.taxNumber || null,
          creditLimit: body.creditLimit,
          openingBalance: body.openingBalance || "0",
          paymentTermsDays: body.paymentTermsDays,
        },
      });

      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          branchId: body.branchId || undefined,
          action: "SUPPLIER_UPDATED",
          module: "supplier",
          entityType: "Supplier",
          entityId: record.id,
          entityReference: record.code,
          previousValues: { name: existing.name, creditLimit: existing.creditLimit.toString() },
          newValues: { name: record.name, creditLimit: record.creditLimit.toString() },
        },
        tx,
      );

      return record;
    });

    if (body.openingBalance && Number(body.openingBalance) > 0) {
      await syncPartyOpeningBalance({
        kind: "supplier",
        partyId: updated.id,
        companyId: context.company.id,
        userId: context.user.id,
        branchId: body.branchId,
      }).catch((err) => {
        console.error("Failed to sync supplier opening balance JV:", err);
      });
    }

    return NextResponse.json(jsonSafe({ data: updated }));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    idSchema.parse(id);
    const context = await requirePermission("supplier.manage");

    const existing = await prisma.supplier.findFirst({
      where: { id, companyId: context.company.id },
      include: {
        _count: { select: { purchaseOrders: true, purchaseReceipts: true, payments: true } },
      },
    });

    if (!existing) {
      throw new ApiError(404, "NOT_FOUND", "Supplier not found.");
    }

    if (existing._count.purchaseOrders > 0 || existing._count.purchaseReceipts > 0 || existing._count.payments > 0) {
      const updated = await prisma.supplier.update({
        where: { id },
        data: { status: "INACTIVE" },
      });
      return NextResponse.json(jsonSafe({ data: updated, message: "Supplier has procurement transactions; deactivated instead." }));
    }

    await prisma.$transaction(async (tx) => {
      await tx.supplier.delete({ where: { id } });
      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          action: "SUPPLIER_DELETED",
          module: "supplier",
          entityType: "Supplier",
          entityId: existing.id,
          entityReference: existing.code,
          previousValues: { name: existing.name, code: existing.code },
        },
        tx,
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
