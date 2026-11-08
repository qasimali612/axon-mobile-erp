import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const context = await requirePermission("policy.manage");
    const data = await prisma.documentSequence.findMany({
      where: { companyId: context.company.id },
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ documentType: "asc" }, { branch: { code: "asc" } }],
    });

    const serialized = data.map((item) => ({
      ...item,
      nextValue: item.nextValue.toString(),
    }));

    return NextResponse.json({ data: serialized });
  } catch (error) {
    return apiError(error);
  }
}

