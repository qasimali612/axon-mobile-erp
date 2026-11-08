import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { getAuthContext, revokeCurrentSession } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAuthContext();
    if (context) {
      await appendAudit({
        companyId: context.company.id,
        actorId: context.user.id,
        branchId: context.activeBranchId,
        warehouseId: context.activeWarehouseId,
        action: "LOGOUT",
        module: "access",
        entityType: "Session",
        entityId: context.sessionId,
        entityReference: context.user.email,
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
        userAgent: request.headers.get("user-agent")?.slice(0, 500),
      });
    }
    await revokeCurrentSession(context?.sessionId);
    return NextResponse.json({ data: { signedOut: true } });
  } catch (error) {
    return apiError(error);
  }
}
