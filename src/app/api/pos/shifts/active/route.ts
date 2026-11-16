import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getActivePosShift } from "@/lib/operations/pos";
import { jsonSafe } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const base = await requireAuth();
    const { searchParams } = new URL(request.url);
    const terminalId = searchParams.get("terminalId");

    const shift = await getActivePosShift(base.company.id, terminalId, base.user.id);
    return NextResponse.json(jsonSafe({ data: shift }));
  } catch (error) {
    return apiError(error);
  }
}

