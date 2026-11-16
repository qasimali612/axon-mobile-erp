import { NextResponse } from "next/server";
import { appendAudit } from "@/lib/audit";
import { takePolicyAudit } from "@/lib/policy-audit";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  if (!host) throw new ApiError(403, "ORIGIN_REJECTED", "Request origin could not be verified.");

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError(403, "ORIGIN_REJECTED", "Invalid request origin.");
  }

  if (originHost !== host) {
    throw new ApiError(403, "ORIGIN_REJECTED", "Cross-origin mutation rejected.");
  }
}

export async function apiError(error: unknown) {
  const deferredAudit = takePolicyAudit(error);
  if (deferredAudit) await appendAudit(deferredAudit).catch(() => undefined);

  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Please correct the highlighted fields.",
          details: error.issues,
        },
      },
      { status: 422 },
    );
  }

  // Map database and constraint violations to clear, actionable user messages
  const known = error as {
    name?: string;
    code?: string;
    meta?: { target?: unknown; table?: unknown };
    message?: string;
  };

  if (known?.name === "PrismaClientInitializationError") {
    console.error("[Database Connection Error]:", known.message);
    return NextResponse.json(
      {
        error: {
          code: "DATABASE_UNREACHABLE",
          message: "Database connection failed. Check that DATABASE_URL is correctly set in your Vercel Environment Variables and that your cloud PostgreSQL database is active.",
        },
      },
      { status: 503 },
    );
  }

  if (known?.name === "PrismaClientKnownRequestError") {
    if (known.code === "P1000" || known.code === "P1001" || known.code === "P1002" || known.code === "P1017") {
      console.error("[Database Server Unreachable]:", known.code, known.message);
      return NextResponse.json(
        {
          error: {
            code: "DATABASE_UNREACHABLE",
            message: "Cannot reach database server. Check your DATABASE_URL connection string and firewall/IP whitelist rules in your cloud database provider.",
          },
        },
        { status: 503 },
      );
    }
    if (known.code === "P2021") {
      console.error("[Database Not Migrated]:", known.message);
      return NextResponse.json(
        {
          error: {
            code: "DATABASE_NOT_MIGRATED",
            message: "Database tables not found. Run 'npx prisma migrate deploy' to apply migrations to your database.",
          },
        },
        { status: 503 },
      );
    }
    if (known.code === "P2002") {
      return NextResponse.json(
        { error: { code: "DUPLICATE_RECORD", message: "A record with the same unique values already exists.", details: known.meta?.target } },
        { status: 409 },
      );
    }
    if (known.code === "P2025") {
      return NextResponse.json(
        { error: { code: "RECORD_NOT_FOUND", message: "The record was not found or was changed by someone else." } },
        { status: 404 },
      );
    }
    if (known.code === "P2003") {
      return NextResponse.json(
        { error: { code: "RECORD_IN_USE", message: "Another record still references this one." } },
        { status: 409 },
      );
    }
  }

  // Handle PostgreSQL check/trigger scope guard and maker-checker violations (ERRCODE 23514)
  const errStr = String(error?.toString() || "");
  if (
    errStr.includes("outside active branch") ||
    errStr.includes("outside selected branch") ||
    errStr.includes("outside active company") ||
    errStr.includes("Session warehouse is outside")
  ) {
    console.error("[Scope Guard Violation]:", errStr);
    return NextResponse.json(
      {
        error: {
          code: "SCOPE_GUARD_VIOLATION",
          message: "Location configuration error: Selected location does not belong to the active company or branch.",
        },
      },
      { status: 422 },
    );
  }

  if (errStr.includes("Operational document children are immutable after draft")) {
    console.error("[Child Immutability Violation]:", errStr);
    return NextResponse.json(
      {
        error: {
          code: "DOCUMENT_NOT_DRAFT",
          message: "Line items can only be modified while the document is in Draft status. Revert document to Draft before editing lines.",
        },
      },
      { status: 409 },
    );
  }

  if (errStr.includes("Invalid operational document status transition")) {
    console.error("[Status Transition Violation]:", errStr);
    return NextResponse.json(
      {
        error: {
          code: "INVALID_STATUS_TRANSITION",
          message: "Invalid document status transition. Please refresh and check current document status.",
        },
      },
      { status: 409 },
    );
  }

  if (errStr.includes("Stock state may only change through the inventory posting service")) {
    console.error("[Inventory Posting Guard]:", errStr);
    return NextResponse.json(
      {
        error: {
          code: "INVENTORY_POSTING_GUARD",
          message: "Stock quantities and serialized units can only be modified through official posting workflows.",
        },
      },
      { status: 409 },
    );
  }

  if (errStr.includes("Can't reach database server") || errStr.includes("PrismaClientInitializationError")) {
    console.error("[Database Connection Error]:", errStr);
    return NextResponse.json(
      {
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Database server connection could not be established. Please verify database connectivity.",
        },
      },
      { status: 503 },
    );
  }

  if (errStr.includes("Unique constraint failed") || errStr.includes("code: \"23505\"") || errStr.includes("P2002")) {
    return NextResponse.json(
      {
        error: {
          code: "DUPLICATE_RECORD",
          message: "A record with this identifier already exists.",
        },
      },
      { status: 409 },
    );
  }

  if (errStr.includes("Record to update not found") || errStr.includes("Record to delete does not exist") || errStr.includes("P2025")) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "The requested record could not be found.",
        },
      },
      { status: 404 },
    );
  }

  if (errStr.includes("Foreign key constraint") || errStr.includes("code: \"23503\"") || errStr.includes("P2003")) {
    return NextResponse.json(
      {
        error: {
          code: "FOREIGN_KEY_VIOLATION",
          message: "The operation references a record that does not exist or has active dependencies.",
        },
      },
      { status: 409 },
    );
  }

  if (errStr.includes("violates check constraint") || errStr.includes("code: \"23514\"")) {
    console.error("[Check Constraint Violation]:", errStr);
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_CONSTRAINT_ERROR",
          message: "Operation violates accounting or operational workflow validation constraints.",
        },
      },
      { status: 422 },
    );
  }

  if (errStr.includes("does not exist") || errStr.includes("P2021")) {
    console.error("[Table Not Found]:", errStr);
    return NextResponse.json(
      {
        error: {
          code: "SCHEMA_MISMATCH",
          message: "Required database table or schema is not initialized. Please ensure migrations are applied.",
        },
      },
      { status: 500 },
    );
  }

  // Always log unexpected server errors for operators; surface a clean message when available
  console.error("[Unexpected Server Error]:", error);
  let cleanMsg = "An unexpected server error occurred.";
  if (error instanceof Error && error.message) {
    const lines = error.message.split("\n").map((l) => l.trim()).filter(Boolean);
    const candidate = lines.find((l) => !l.startsWith("at ") && !l.includes("PrismaClient") && !l.includes("node_modules"));
    if (candidate && candidate.length <= 200) {
      cleanMsg = candidate;
    }
  }
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: cleanMsg } },
    { status: 500 },
  );
}

export function parsePagination(url: string) {
  const params = new URL(url).searchParams;
  const page = Math.max(1, Number(params.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") || 20)));
  return { page, pageSize, skip: (page - 1) * pageSize, params };
}
