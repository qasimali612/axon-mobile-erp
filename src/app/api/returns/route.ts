import { NextResponse } from "next/server";
import { OperationalDocumentStatus, Prisma, StockReturnType } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin, parsePagination } from "@/lib/api";
import { permittedDocumentScopes, requireAuth, requirePermission } from "@/lib/auth";
import { shouldAutoPost } from "@/lib/operating-mode";
import {
  approveStockReturn,
  createStockReturnDraft,
  postStockReturn,
  submitStockReturn,
} from "@/lib/operations/stock-return";
import { stockReturnDraftSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const base = await requireAuth(); const { page, pageSize, skip, params } = parsePagination(request.url);
    const typeValue = params.get("type"); const returnType = typeValue && Object.values(StockReturnType).includes(typeValue as StockReturnType) ? typeValue as StockReturnType : null;
    if (!returnType) throw new ApiError(422, "RETURN_TYPE_REQUIRED", "A valid return type filter is required.");
    const permission = returnType === StockReturnType.PURCHASE_RETURN ? "purchase.view" : "sales.view";
    const context = await requirePermission(permission); const allowedScopes = permittedDocumentScopes(context, permission);
    const statusValue = params.get("status"); const status = statusValue && Object.values(OperationalDocumentStatus).includes(statusValue as OperationalDocumentStatus) ? statusValue as OperationalDocumentStatus : undefined;
    const search = params.get("search")?.trim();
    const where: Prisma.StockReturnWhereInput = { companyId: base.company.id, returnType, ...(status ? { status } : {}), AND: [...(allowedScopes ? [{ OR: allowedScopes }] : []), ...(search ? [{ OR: [{ returnNumber: { contains: search, mode: "insensitive" as const } }, { customer: { name: { contains: search, mode: "insensitive" as const } } }, { supplier: { name: { contains: search, mode: "insensitive" as const } } }] }] : [])] };
    const [items, total] = await Promise.all([
      prisma.stockReturn.findMany({ where, include: { branch: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true, type: true } }, customer: { select: { code: true, name: true } }, supplier: { select: { code: true, name: true } }, salesInvoice: { select: { invoiceNumber: true } }, purchaseReceipt: { select: { receiptNumber: true } }, preparedBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } }, postedBy: { select: { fullName: true } }, journalEntry: { select: { id: true, voucherNumber: true } }, _count: { select: { lines: true } } }, orderBy: [{ returnDate: "desc" }, { returnNumber: "desc" }], skip, take: pageSize }),
      prisma.stockReturn.count({ where }),
    ]);
    return NextResponse.json(jsonSafe({ data: items, pagination: { page, pageSize, total } }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = stockReturnDraftSchema.parse(await request.json());
    const permission = body.returnType === StockReturnType.SALES_RETURN ? "SALES_RETURN_CREATE" : "PURCHASE_RETURN_CREATE";
    const context = await requirePermission(permission, { branchId: body.branchId, warehouseId: body.warehouseId });
    const actor = { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode };
    const data = await createStockReturnDraft(actor, body);

    const willAutoPost = await shouldAutoPost(prisma, context.company.id, body.autoPost);
    if (willAutoPost) {
      try {
        await submitStockReturn(actor, data.id);
        await approveStockReturn(actor, data.id);
        const posted = await postStockReturn(actor, data.id);
        return NextResponse.json(jsonSafe({ data: posted }), { status: 201 });
      } catch (autoErr) {
        console.warn("Stock return auto-post deferred to draft:", autoErr);
        return NextResponse.json(
          jsonSafe({
            data,
            warning:
              "Return created as draft. Direct posting was deferred: " +
              (autoErr instanceof Error ? autoErr.message : String(autoErr)),
          }),
          { status: 201 }
        );
      }
    }

    return NextResponse.json(jsonSafe({ data }), { status: 201 });
  } catch (error) { return apiError(error); }
}
