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

  // Constraint violations are client-correctable conditions, not server faults. Mapping them keeps
  // duplicate submissions and stale edits from surfacing as generic 500s.
  const known = error as { name?: string; code?: string; meta?: { target?: unknown } };
  if (known?.name === "PrismaClientKnownRequestError") {
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

  // Always log unexpected server errors for operators; the client response stays generic.
  console.error(error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } },
    { status: 500 },
  );
}

export function parsePagination(url: string) {
  const params = new URL(url).searchParams;
  const page = Math.max(1, Number(params.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") || 20)));
  return { page, pageSize, skip: (page - 1) * pageSize, params };
}
