import { NextResponse } from "next/server";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { idSchema, sequenceSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("policy.manage");
    const { id } = await params;
    idSchema.parse(id);
    const input = sequenceSchema.parse(await request.json());

    const existing = await prisma.documentSequence.findUnique({
      where: { id },
    });
    if (!existing || existing.companyId !== context.company.id) {
      throw new ApiError(404, "NOT_FOUND", "Document sequence configuration not found.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.documentSequence.update({
        where: { id },
        data: {
          prefix: input.prefix,
          padding: input.padding,
          ...(input.nextValue !== undefined ? { nextValue: BigInt(input.nextValue) } : {}),
          version: { increment: 1 },
        },
      });
      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          branchId: record.branchId,
          action: "DOCUMENT_SEQUENCE_UPDATED",
          module: "settings",
          entityType: "DocumentSequence",
          entityId: record.id,
          entityReference: `${record.documentType}-${record.prefix}`,
          previousValues: { prefix: existing.prefix, padding: existing.padding, nextValue: existing.nextValue.toString() },
          newValues: { prefix: record.prefix, padding: record.padding, nextValue: record.nextValue.toString() },
        },
        tx,
      );
      return record;
    });

    return NextResponse.json({
      data: {
        ...updated,
        nextValue: updated.nextValue.toString(),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
