import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { supplierDraftSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

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

    return NextResponse.json(jsonSafe({ data: supplier }));
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
