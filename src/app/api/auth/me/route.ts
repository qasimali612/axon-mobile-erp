import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    return NextResponse.json({ data: await requireAuth() });
  } catch (error) {
    return apiError(error);
  }
}
