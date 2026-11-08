import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const context = await requireAuth();
    const items = await prisma.notification.findMany({
      where: { companyId: context.company.id, recipientId: context.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ data: items });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireAuth();
    const input = z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() }).parse(await request.json());
    await prisma.notification.updateMany({
      where: {
        companyId: context.company.id,
        recipientId: context.user.id,
        readAt: null,
        ...(input.id ? { id: input.id } : {}),
      },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ data: { updated: true } });
  } catch (error) {
    return apiError(error);
  }
}
