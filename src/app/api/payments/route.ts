import { NextResponse } from "next/server";
import { OperationalDocumentStatus, PaymentDirection } from "@prisma/client";
import { apiError, assertSameOrigin, parsePagination } from "@/lib/api";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { shouldAutoPost } from "@/lib/operating-mode";
import {
  approvePayment,
  createPaymentDraft,
  postPayment,
  submitPayment,
} from "@/lib/operations/payments";
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
    const actor = { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode, permissions: context.permissions };
    const payment = await createPaymentDraft(actor, body);

    const willAutoPost = await shouldAutoPost(prisma, context.company.id, body.autoPost);
    if (willAutoPost) {
      try {
        await submitPayment(actor, payment.id);
        await approvePayment(actor, payment.id);
        const posted = await postPayment(actor, payment.id);
        return NextResponse.json(jsonSafe({ data: posted }), { status: 201 });
      } catch (autoErr) {
        console.warn("Payment auto-post deferred to draft:", autoErr);
        return NextResponse.json(
          jsonSafe({
            data: payment,
            warning:
              "Payment saved as draft. Direct posting was deferred: " +
              (autoErr instanceof Error ? autoErr.message : String(autoErr)),
          }),
          { status: 201 }
        );
      }
    }

    return NextResponse.json(jsonSafe({ data: payment }), { status: 201 });
  } catch (error) { return apiError(error); }
}
