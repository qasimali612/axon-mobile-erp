import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { apiError, parsePagination } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

function csvCell(value: unknown) {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  try {
    const { page, pageSize, skip, params } = parsePagination(request.url);
    const format = params.get("format");
    const context = await requirePermission(format === "csv" ? "audit.export" : "audit.view");
    const moduleFilter = params.get("module")?.trim();
    const action = params.get("action")?.trim();
    const search = params.get("search")?.trim();
    const from = params.get("from") ? new Date(params.get("from")!) : undefined;
    const to = params.get("to") ? new Date(`${params.get("to")}T23:59:59.999Z`) : undefined;

    const where: Prisma.AuditLogWhereInput = {
      companyId: context.company.id,
      ...(moduleFilter ? { module: moduleFilter } : {}),
      ...(action ? { action } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(search
        ? {
            OR: [
              { entityReference: { contains: search, mode: "insensitive" } },
              { action: { contains: search, mode: "insensitive" } },
              { actor: { fullName: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    if (format === "csv") {
      const rows = await prisma.auditLog.findMany({
        where,
        include: { actor: { select: { fullName: true, email: true } }, branch: { select: { code: true } }, warehouse: { select: { code: true } } },
        orderBy: { createdAt: "desc" },
        take: 10_000,
      });
      const header = ["Timestamp", "User", "Email", "Module", "Action", "Entity", "Reference", "Outcome", "Branch", "Warehouse", "Reason", "Previous values", "New values"];
      const csv = [
        header.map(csvCell).join(","),
        ...rows.map((row) =>
          [row.createdAt.toISOString(), row.actor?.fullName, row.actor?.email, row.module, row.action, row.entityType, row.entityReference, row.outcome, row.branch?.code, row.warehouse?.code, row.reason, row.previousValues, row.newValues]
            .map(csvCell)
            .join(","),
        ),
      ].join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const [items, total, modules] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: { fullName: true, email: true } }, branch: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where: { companyId: context.company.id }, distinct: ["module"], select: { module: true }, orderBy: { module: "asc" } }),
    ]);
    return NextResponse.json(jsonSafe({ data: items, filters: { modules: modules.map((item) => item.module) }, meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) } }));
  } catch (error) {
    return apiError(error);
  }
}
