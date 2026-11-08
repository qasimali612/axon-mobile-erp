import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const context = await requirePermission("ASSET_VIEW");
    const branches = permittedBranchIds(context, "ASSET_VIEW");
    const period = new URL(request.url).searchParams.get("period") || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return NextResponse.json({ error: { code: "INVALID_PERIOD", message: "Use the YYYY-MM period format." } }, { status: 422 });
    const [year, month] = period.split("-").map(Number);
    const periodDate = new Date(Date.UTC(year, month, 0));
    const schedules = await prisma.assetDepreciationSchedule.findMany({
      where: { periodDate, asset: { companyId: context.company.id, ...(branches ? { branchId: { in: branches } } : {}) } },
      include: { asset: { select: { code: true, name: true, status: true, depreciationMethod: true, branch: { select: { code: true } } } }, journalEntry: { select: { id: true, voucherNumber: true, status: true } } },
      orderBy: [{ status: "asc" }, { asset: { code: "asc" } }],
    });
    return NextResponse.json(jsonSafe({ data: schedules, periodDate: periodDate.toISOString().slice(0, 10) }));
  } catch (error) { return apiError(error); }
}
