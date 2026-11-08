import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

const MODULES = ["operations", "inventory", "sales", "purchases", "payments", "audit", "reports"] as const;

const viewSchema = z.object({
  module: z.enum(MODULES),
  name: z.string().trim().min(2).max(80),
  query: z.record(z.string(), z.string().max(200)).default({}),
  isShared: z.boolean().default(false),
});

export async function GET(request: Request) {
  try {
    const context = await requireAuth();
    const moduleFilter = new URL(request.url).searchParams.get("module") || undefined;
    const data = await prisma.savedView.findMany({
      where: {
        companyId: context.company.id,
        ...(moduleFilter ? { module: moduleFilter } : {}),
        OR: [{ userId: context.user.id }, { isShared: true }],
      },
      orderBy: [{ module: "asc" }, { name: "asc" }],
      take: 200,
    });
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireAuth();
    const input = viewSchema.parse(await request.json());
    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.savedView.findUnique({ where: { userId_module_name: { userId: context.user.id, module: input.module, name: input.name } }, select: { id: true } });
      if (existing) throw new ApiError(409, "VIEW_NAME_TAKEN", "You already have a saved view with this name for that screen.");
      const row = await tx.savedView.create({
        data: { companyId: context.company.id, userId: context.user.id, module: input.module, name: input.name, query: input.query, isShared: input.isShared },
      });
      await appendAudit({
        companyId: context.company.id,
        actorId: context.user.id,
        action: "SAVED_VIEW_CREATED",
        module: "reports",
        entityType: "SavedView",
        entityId: row.id,
        entityReference: `${input.module}/${input.name}`,
        newValues: { isShared: row.isShared, filters: Object.keys(input.query).length },
      }, tx);
      return row;
    });
    return NextResponse.json(jsonSafe({ data: created }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
