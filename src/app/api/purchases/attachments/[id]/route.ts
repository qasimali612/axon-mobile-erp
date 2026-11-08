import { readFile } from "node:fs/promises";
import path from "node:path";
import { apiError, ApiError } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idSchema } from "@/lib/validation";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const base = await requireAuth();
    const id = idSchema.parse((await params).id);
    const attachment = await prisma.attachment.findFirst({ where: { id, companyId: base.company.id } });
    if (!attachment || !["PurchaseOrder", "PurchaseReceipt"].includes(attachment.entityType)) {
      throw new ApiError(404, "ATTACHMENT_NOT_FOUND", "Attachment was not found.");
    }
    const record = attachment.entityType === "PurchaseOrder"
      ? await prisma.purchaseOrder.findFirst({ where: { id: attachment.entityId, companyId: base.company.id }, select: { branchId: true, warehouseId: true } })
      : await prisma.purchaseReceipt.findFirst({ where: { id: attachment.entityId, companyId: base.company.id }, select: { branchId: true, warehouseId: true } });
    if (!record) throw new ApiError(404, "PROCUREMENT_DOCUMENT_NOT_FOUND", "The procurement document was not found.");
    await requirePermission("purchase.view", record);
    if (attachment.isQuarantined || !attachment.scannedAt) throw new ApiError(423, "ATTACHMENT_QUARANTINED", "This attachment is quarantined pending a security scan.");
    const absolutePath = path.resolve(process.cwd(), attachment.storageKey);
    const storageRoot = path.resolve(process.cwd(), "storage", "attachments");
    if (!absolutePath.startsWith(`${storageRoot}${path.sep}`)) throw new ApiError(409, "INVALID_STORAGE_KEY", "Attachment storage key is invalid.");
    const bytes = await readFile(absolutePath);
    const safeName = attachment.originalName.replace(/["\r\n]/g, "_");
    return new Response(bytes, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
