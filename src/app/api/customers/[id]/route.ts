import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { customerDraftSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const context = await requirePermission("customer.manage");
    const { id } = await params;
    idSchema.parse(id);

    const customer = await prisma.customer.findFirst({
      where: { id, companyId: context.company.id },
      include: {
        branch: { select: { id: true, code: true, name: true } },
        priceList: { select: { id: true, code: true, name: true } },
      },
    });

    if (!customer) {
      throw new ApiError(404, "NOT_FOUND", "Customer not found.");
    }

    return NextResponse.json(jsonSafe({ data: customer }));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    idSchema.parse(id);
    const body = customerDraftSchema.parse(await request.json());
    const context = await requirePermission("customer.manage", { branchId: body.branchId });

    const existing = await prisma.customer.findFirst({
      where: { id, companyId: context.company.id },
    });

    if (!existing) {
      throw new ApiError(404, "NOT_FOUND", "Customer not found.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (body.priceListId) {
        const priceList = await tx.priceList.findFirst({
          where: { id: body.priceListId, companyId: context.company.id, isActive: true },
          select: { id: true },
        });
        if (!priceList) {
          throw new ApiError(422, "INVALID_PRICE_LIST", "Select an active price list in this company.");
        }
      }

      const record = await tx.customer.update({
        where: { id },
        data: {
          branchId: body.branchId || null,
          code: body.code,
          name: body.name,
          customerType: body.customerType,
          phone: body.phone || null,
          email: body.email || null,
          address: body.address || null,
          taxNumber: body.taxNumber || null,
          creditLimit: body.creditLimit,
          paymentTermsDays: body.paymentTermsDays,
          priceListId: body.priceListId || null,
          status: body.status || existing.status,
        },
        include: {
          branch: { select: { id: true, code: true, name: true } },
          priceList: { select: { id: true, code: true, name: true, priceLevel: true } },
        },
      });

      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          branchId: body.branchId || undefined,
          action: "CUSTOMER_UPDATED",
          module: "customer",
          entityType: "Customer",
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
    const context = await requirePermission("customer.manage");

    const existing = await prisma.customer.findFirst({
      where: { id, companyId: context.company.id },
      include: {
        _count: { select: { salesInvoices: true, payments: true } },
      },
    });

    if (!existing) {
      throw new ApiError(404, "NOT_FOUND", "Customer not found.");
    }

    if (existing._count.salesInvoices > 0 || existing._count.payments > 0) {
      const updated = await prisma.customer.update({
        where: { id },
        data: { status: "INACTIVE" },
      });
      return NextResponse.json(jsonSafe({ data: updated, message: "Customer has commercial transactions; deactivated instead." }));
    }

    await prisma.$transaction(async (tx) => {
      await tx.customer.delete({ where: { id } });
      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          action: "CUSTOMER_DELETED",
          module: "customer",
          entityType: "Customer",
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
