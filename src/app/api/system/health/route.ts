import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const started = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const details = new URL(request.url).searchParams.get("details") === "true";
    if (!details) {
      return NextResponse.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: "reachable",
        latencyMs: Math.round(performance.now() - started),
      });
    }

    await requirePermission("system.health.view");
    const [companies, users, sessions] = await Promise.all([
      prisma.company.count({ where: { status: "ACTIVE" } }),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "0.1.0",
      database: "reachable",
      latencyMs: Math.round(performance.now() - started),
      counts: { companies, activeUsers: users, activeSessions: sessions },
    });
  } catch (error) {
    return apiError(error);
  }
}
