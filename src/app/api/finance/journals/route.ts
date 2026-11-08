import { NextResponse } from "next/server";
import { JournalStatus } from "@prisma/client";
import { apiError, assertSameOrigin, parsePagination } from "@/lib/api";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { createJournalDraft } from "@/lib/finance/posting";
import { journalDraftSchema } from "@/lib/finance/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const context = await requirePermission("GL_VIEW");
    const { page, pageSize, skip, params } = parsePagination(request.url);
    const statusParam = params.get("status");
    const status = statusParam && Object.values(JournalStatus).includes(statusParam as JournalStatus)
      ? (statusParam as JournalStatus)
      : undefined;
    const requestedBranchId = params.get("branchId") || undefined;
    const allowedBranchIds = permittedBranchIds(context, "GL_VIEW");
    const branchId = requestedBranchId && (!allowedBranchIds || allowedBranchIds.includes(requestedBranchId)) ? requestedBranchId : undefined;
    const search = params.get("search")?.trim() || undefined;
    const from = params.get("from") ? new Date(`${params.get("from")}T00:00:00.000Z`) : undefined;
    const to = params.get("to") ? new Date(`${params.get("to")}T00:00:00.000Z`) : undefined;
    const where = {
      companyId: context.company.id,
      ...(status ? { status } : {}),
      ...(branchId ? { branchId } : allowedBranchIds ? { branchId: { in: allowedBranchIds } } : {}),
      ...(from || to
        ? { postingDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
      ...(search
        ? {
            OR: [
              { voucherNumber: { contains: search, mode: "insensitive" as const } },
              { narration: { contains: search, mode: "insensitive" as const } },
              { referenceDocument: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: {
          branch: { select: { code: true, name: true } },
          period: { select: { name: true } },
          preparedBy: { select: { fullName: true } },
          approvedBy: { select: { fullName: true } },
          postedBy: { select: { fullName: true } },
          _count: { select: { lines: true } },
        },
        orderBy: [{ postingDate: "desc" }, { voucherNumber: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.journalEntry.count({ where }),
    ]);
    return NextResponse.json(jsonSafe({ data: items, pagination: { page, pageSize, total } }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = journalDraftSchema.parse(await request.json());
    const context = await requirePermission("JOURNAL_CREATE", { branchId: body.branchId });
    const journal = await createJournalDraft(
      {
        companyId: context.company.id,
        userId: context.user.id,
        currencyCode: context.company.currencyCode,
      },
      { ...body, sourceModule: "MANUAL" },
    );
    return NextResponse.json(jsonSafe({ data: journal }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
