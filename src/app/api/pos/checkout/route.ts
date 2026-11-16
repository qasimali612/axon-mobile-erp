import { NextResponse } from "next/server";
import { apiError, ApiError } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { executePosCheckout, type PosCheckoutInput } from "@/lib/operations/pos";
import { jsonSafe } from "@/lib/serializers";

export async function POST(request: Request) {
  try {
    const base = await requireAuth();
    const body = (await request.json().catch(() => null)) as PosCheckoutInput | null;
    if (!body || typeof body !== "object") {
      throw new ApiError(400, "BAD_REQUEST", "A JSON request body is required.");
    }
    if (!body.branchId || !body.warehouseId || !body.customerId) {
      throw new ApiError(422, "MISSING_REQUIRED_FIELDS", "branchId, warehouseId, and customerId are required.");
    }
    if (!body.idempotencyKey) {
      throw new ApiError(422, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required to guarantee atomic counter checkout.");
    }

    const context = await requirePermission("SALES_INVOICE_CREATE", {
      branchId: body.branchId,
      warehouseId: body.warehouseId,
    });

    const actor = {
      companyId: context.company.id,
      userId: context.user.id,
      currencyCode: context.company.currencyCode,
      permissions: context.permissions,
      overrideReason: body.creditOverrideReason || undefined,
    };

    const result = await executePosCheckout(actor, body);

    return NextResponse.json(jsonSafe({ data: result }), { status: result.isDuplicate ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}

