import { NextResponse } from "next/server";
import { apiError, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { closePosShift } from "@/lib/operations/pos";
import { idSchema } from "@/lib/validation";
import { jsonSafe } from "@/lib/serializers";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const base = await requireAuth();
    const id = idSchema.parse((await params).id);
    const body = (await request.json().catch(() => null)) as {
      closingActualCash?: string | number;
      notes?: string;
    } | null;

    const actor = {
      companyId: base.company.id,
      userId: base.user.id,
      currencyCode: base.company.currencyCode,
      permissions: base.permissions,
    };

    const shift = await closePosShift(actor, {
      shiftId: id,
      closingActualCash: String(body?.closingActualCash ?? "0"),
      notes: body?.notes || null,
    });

    return NextResponse.json(jsonSafe({ data: shift }));
  } catch (error) {
    return apiError(error);
  }
}

