import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { restoreDatabaseBackup } from "@/lib/backup/backup-service";
import { jsonSafe } from "@/lib/serializers";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("backup.restore");

    const body = await request.json();
    const { confirmation, backupPayload } = body;

    if (confirmation !== "RESTORE") {
      return NextResponse.json(
        {
          error: {
            code: "CONFIRMATION_REQUIRED",
            message: 'You must type "RESTORE" to authorize overwriting the database.',
          },
        },
        { status: 400 },
      );
    }

    if (!backupPayload) {
      return NextResponse.json(
        {
          error: {
            code: "PAYLOAD_REQUIRED",
            message: "A valid backup JSON payload is required for restoration.",
          },
        },
        { status: 400 },
      );
    }

    const result = await restoreDatabaseBackup(backupPayload, context.user.id);

    return NextResponse.json(
      jsonSafe({
        data: {
          message: "Database successfully restored from backup.",
          result,
        },
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
