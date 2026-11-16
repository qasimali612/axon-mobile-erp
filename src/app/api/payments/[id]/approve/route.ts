import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    await requireAuth();
    await params;
    throw new ApiError(
      410,
      "APPROVAL_WORKFLOW_ELIMINATED",
      "Payment approval workflow has been eliminated. Vouchers must be posted directly via /api/payments/[id]/post.",
    );
  } catch (error) {
    return apiError(error);
  }
}
