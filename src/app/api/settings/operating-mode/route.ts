import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { jsonSafe } from "@/lib/serializers";
import {
  getOperatingModeConfig,
  setOperatingMode,
  OperatingMode,
} from "@/lib/operating-mode";

const updateModeSchema = z.object({
  mode: z.enum(["SINGLE_USER", "MULTI_USER"]),
  reason: z.string().trim().optional(),
});

export async function GET() {
  try {
    const context = await requireAuth();
    const config = await getOperatingModeConfig(undefined, context.company.id);

    const canManage =
      context.permissions.includes("policy.manage") ||
      context.permissions.includes("company.manage") ||
      context.permissions.includes("USER_MANAGE") ||
      context.permissions.includes("settings.manage") ||
      context.permissions.includes("finance.manage") ||
      context.permissions.includes("SALES_INVOICE_POST") ||
      context.permissions.includes("PAYMENT_POST") ||
      context.permissions.includes("SALES_INVOICE_APPROVE") ||
      context.permissions.includes("PAYMENT_APPROVE") ||
      context.roles.some((r) => ["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "MANAGER"].includes(r.name));

    return NextResponse.json(
      jsonSafe({
        data: {
          ...config,
          canManage,
        },
      })
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireAuth();
    const canManage =
      context.permissions.includes("policy.manage") ||
      context.permissions.includes("company.manage") ||
      context.permissions.includes("USER_MANAGE") ||
      context.permissions.includes("settings.manage") ||
      context.permissions.includes("finance.manage") ||
      context.permissions.includes("SALES_INVOICE_POST") ||
      context.permissions.includes("PAYMENT_POST") ||
      context.permissions.includes("SALES_INVOICE_APPROVE") ||
      context.permissions.includes("PAYMENT_APPROVE") ||
      context.roles.some((r) => ["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "MANAGER"].includes(r.name));

    if (!canManage) {
      throw new ApiError(403, "FORBIDDEN", "You do not have permission to change the operating mode.");
    }

    const body = updateModeSchema.parse(await request.json().catch(() => ({})));
    const reason =
      body.reason && body.reason.trim().length >= 5
        ? body.reason.trim()
        : `Switched to ${body.mode === "SINGLE_USER" ? "Single-User Mode" : "Multi-User Mode"} via workspace quick toggle`;

    const updated = await setOperatingMode(
      {
        companyId: context.company.id,
        userId: context.user.id,
        fullName: context.user.fullName,
      },
      body.mode as OperatingMode,
      reason
    );

    return NextResponse.json(jsonSafe({ data: updated }));
  } catch (error) {
    return apiError(error);
  }
}

