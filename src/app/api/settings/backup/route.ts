import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { createDatabaseBackup, listDatabaseBackups } from "@/lib/backup/backup-service";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const context = await requirePermission("backup.manage");
    const { searchParams } = new URL(request.url);
    const downloadFile = searchParams.get("download");

    // Direct download file stream
    if (downloadFile) {
      const sanitized = path.basename(downloadFile);
      const filePath = path.join(process.cwd(), "backups", sanitized);
      const content = await fs.readFile(filePath, "utf8");

      return new NextResponse(content, {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${sanitized}"`,
        },
      });
    }

    // List backups & current live counts
    const backups = await listDatabaseBackups();
    const liveCounts = {
      accounts: await prisma.account.count({ where: { companyId: context.company.id } }),
      products: await prisma.product.count({ where: { companyId: context.company.id } }),
      stockUnits: await prisma.physicalStockUnit.count({ where: { companyId: context.company.id } }),
      deviceIdentifiers: await prisma.deviceIdentifier.count({ where: { companyId: context.company.id } }),
      purchaseOrders: await prisma.purchaseOrder.count({ where: { companyId: context.company.id } }),
      purchaseReceipts: await prisma.purchaseReceipt.count({ where: { companyId: context.company.id } }),
      salesInvoices: await prisma.salesInvoice.count({ where: { companyId: context.company.id } }),
      journals: await prisma.journalEntry.count({ where: { companyId: context.company.id } }),
      customers: await prisma.customer.count({ where: { companyId: context.company.id } }),
      suppliers: await prisma.supplier.count({ where: { companyId: context.company.id } }),
    };

    return NextResponse.json(
      jsonSafe({
        data: {
          backups,
          liveCounts,
          company: context.company,
        },
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("backup.manage");

    const result = await createDatabaseBackup(context.company.id, context.user.id);

    return NextResponse.json(
      jsonSafe({
        data: {
          message: "Database backup created successfully.",
          filename: result.filename,
          sizeBytes: result.sizeBytes,
          timestamp: result.timestamp,
          totalRecords: result.totalRecords,
          counts: result.counts,
        },
      }),
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
