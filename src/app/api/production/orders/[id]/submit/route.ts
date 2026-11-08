import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { submitProductionOrder } from "@/lib/operations/production";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("production.order.create");
    const { id } = await params;
    idSchema.parse(id);

    const order = await submitProductionOrder(context.company.id, id, context.user.id);
    return NextResponse.json(jsonSafe({ data: order }));
  } catch (error) {
    return apiError(error);
  }
}

