import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { issueProductionMaterials } from "@/lib/operations/production";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("production.issue.post");
    const { id } = await params;
    idSchema.parse(id);

    const actor = {
      companyId: context.company.id,
      userId: context.user.id,
      currencyCode: context.company.currencyCode,
    };

    const result = await issueProductionMaterials(actor, id);
    return NextResponse.json(jsonSafe({ data: result }));
  } catch (error) {
    return apiError(error);
  }
}

