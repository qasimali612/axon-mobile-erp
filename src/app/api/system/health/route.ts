import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const started = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;

    let tablesExist = true;
    let companyCount = 0;
    let userCount = 0;
    let branchCount = 0;

    try {
      [companyCount, userCount, branchCount] = await Promise.all([
        prisma.company.count(),
        prisma.user.count(),
        prisma.branch.count(),
      ]);
    } catch {
      tablesExist = false;
    }

    const latencyMs = Math.round(performance.now() - started);

    if (!tablesExist) {
      return NextResponse.json(
        {
          status: "needs_migration",
          database: "connected",
          tablesExist: false,
          latencyMs,
          message: "Database is reachable, but schema migrations have not been applied. Run 'npx prisma migrate deploy'.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "reachable",
      latencyMs,
      diagnostics: {
        tablesMigrated: true,
        companies: companyCount,
        users: userCount,
        branches: branchCount,
        readyForLogin: userCount > 0 && branchCount > 0,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
