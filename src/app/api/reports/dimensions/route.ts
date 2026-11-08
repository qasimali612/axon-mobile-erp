import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { permittedDocumentScopes, requireAuth } from "@/lib/auth";
import { getReportFilterDimensions } from "@/lib/reports/dimensions";
import { jsonSafe } from "@/lib/serializers";

export async function GET() {
  try {
    const context = await requireAuth();
    const scopes = permittedDocumentScopes(context, "report.inventory") || undefined;
    const dimensions = await getReportFilterDimensions(context.company.id, scopes);
    return NextResponse.json(jsonSafe({ data: dimensions }));
  } catch (error) {
    return apiError(error);
  }
}

