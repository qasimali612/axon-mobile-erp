import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { jsonSafe } from "@/lib/serializers";
import {
  getOperatingModeConfig,
  setOperatingMode,
  OperatingMode,
} from "@/lib/operating-mode";

const updateModeSchema = z.object({
  mode: z.enum(["SINGLE_USER", "MULTI_USER"]),
  reason: z.string().trim().min(5, "A reason of at least 5 characters is required."),
});

export async function GET() {
  try {
    const context = await requirePermission("dashboard.view");
    const config = await getOperatingModeConfig(undefined, context.company.id);

    const canManage =
      context.permissions.includes("policy.manage") ||
      context.permissions.includes("company.manage") ||
      context.permissions.includes("USER_MANAGE");

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
    const context = await requirePermission("policy.manage");
    const body = updateModeSchema.parse(await request.json());

    const updated = await setOperatingMode(
      {
        companyId: context.company.id,
        userId: context.user.id,
        fullName: context.user.fullName,
      },
      body.mode as OperatingMode,
      body.reason
    );

    return NextResponse.json(jsonSafe({ data: updated }));
  } catch (error) {
    return apiError(error);
  }
}

