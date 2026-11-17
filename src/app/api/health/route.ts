import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();
  try {
    // Ping database with simple query
    await prisma.$queryRaw`SELECT 1`;
    const responseTimeMs = Date.now() - startTime;

    return NextResponse.json(
      {
        status: "healthy",
        system: "AXON MOBILE ERP",
        version: "1.0.0",
        environment: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),
        database: {
          status: "connected",
          provider: "postgresql",
          latencyMs: responseTimeMs,
        },
        services: {
          inventory: "operational",
          finance: "operational",
          auth: "operational",
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    return NextResponse.json(
      {
        status: "unhealthy",
        system: "AXON MOBILE ERP",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        database: {
          status: "disconnected",
          error: error instanceof Error ? error.message : "Database connection failed",
          latencyMs: responseTimeMs,
        },
      },
      { status: 503 },
    );
  }
}

