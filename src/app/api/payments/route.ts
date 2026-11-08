import { NextResponse } from "next/server";
import { OperationalDocumentStatus, PaymentDirection } from "@prisma/client";
import { apiError, assertSameOrigin, parsePagination } from "@/lib/api";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { createPaymentDraft } from "@/lib/operations/payments";
import { paymentDraftSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const context = await requirePermission("PAYMENT_VIEW");
    const { page, pageSize, skip, params } = parsePagination(request.url);
    const allowedBranches = permittedBranchIds(context, "PAYMENT_VIEW");
    const statusValue = params.get("status");
    const directionValue = params.get("direction");
    const status = statusValue && Object.values(OperationalDocumentStatus).includes(statusValue as OperationalDocumentStatus) ? statusValue as OperationalDocumentStatus : undefined;
    const direction = directionValue && Object.values(PaymentDirection).includes(directionValue as PaymentDirection) ? directionValue as PaymentDirection : undefined;
    const search = params.get("search")?.trim();
    const where = {
      companyId: context.company.id,
      ...(allowedBranches ? { branchId: { in: allowedBranches } } : {}),
      ...(status ? { status } : {}),
      ...(direction ? { direction } : {}),
      ...(search ? { OR: [
        { paymentNumber: { contains: search, mode: "insensitive" as const } },
        { reference: { contains: search, mode: "insensitive" as const } },
        { customer: { name: { contains: search, mode: "insensitive" as const } } },
        { supplier: { name: { contains: search, mode: "insensitive" as const } } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.payment.findMany({ where, include: { branch: { select: { code: true, name: true } }, customer: { select: { code: true, name: true } }, supplier: { select: { code: true, name: true } }, bankAccount: { select: { code: true, bankName: true } }, cashAccount: { select: { code: true, name: true } }, preparedBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } }, postedBy: { select: { fullName: true } }, journalEntry: { select: { id: true, voucherNumber: true } }, _count: { select: { allocations: true } } }, orderBy: [{ paymentDate: "desc" }, { paymentNumber: "desc" }], skip, take: pageSize }),
      prisma.payment.count({ where }),
    ]);
    return NextResponse.json(jsonSafe({ data: items, pagination: { page, pageSize, total } }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = paymentDraftSchema.parse(await request.json());
    const context = await requirePermission("PAYMENT_CREATE", { branchId: body.branchId });
    const payment = await createPaymentDraft({ companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode }, body);
    return NextResponse.json(jsonSafe({ data: payment }), { status: 201 });
  } catch (error) { return apiError(error); }
}
