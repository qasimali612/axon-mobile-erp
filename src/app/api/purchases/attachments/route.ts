import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export const runtime = "nodejs";

const entityTypeSchema = z.enum(["PurchaseOrder", "PurchaseReceipt"]);
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

async function documentScope(companyId: string, entityType: z.infer<typeof entityTypeSchema>, entityId: string) {
  const record = entityType === "PurchaseOrder"
    ? await prisma.purchaseOrder.findFirst({ where: { id: entityId, companyId }, select: { branchId: true, warehouseId: true } })
    : await prisma.purchaseReceipt.findFirst({ where: { id: entityId, companyId }, select: { branchId: true, warehouseId: true } });
  if (!record) throw new ApiError(404, "PROCUREMENT_DOCUMENT_NOT_FOUND", "The procurement document was not found.");
  return record;
}

function hasBlockedSignature(bytes: Uint8Array) {
  const prefix = Buffer.from(bytes.slice(0, 4)).toString("hex").toLowerCase();
  return prefix === "4d5a9000" || prefix.startsWith("7f454c46");
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const base = await requireAuth();
    const form = await request.formData();
    const entityType = entityTypeSchema.parse(form.get("entityType"));
    const entityId = z.string().uuid().parse(form.get("entityId"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(422, "ATTACHMENT_REQUIRED", "Select a file to upload.");
    if (!file.size || file.size > MAX_BYTES) throw new ApiError(422, "ATTACHMENT_SIZE", "Attachments must be between 1 byte and 10 MB.");
    if (!ALLOWED_TYPES.has(file.type)) throw new ApiError(422, "ATTACHMENT_TYPE", "Only PDF, JPEG, PNG, CSV, and XLSX attachments are accepted.");
    const scope = await documentScope(base.company.id, entityType, entityId);
    const context = await requirePermission("PURCHASE_DOCUMENT_ATTACHMENT", scope);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (hasBlockedSignature(bytes)) throw new ApiError(422, "ATTACHMENT_REJECTED", "Executable file content is not permitted.");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const storageName = `${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-160)}`;
    const relativeKey = path.posix.join("storage", "attachments", context.company.id, storageName);
    const absolutePath = path.join(process.cwd(), relativeKey);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes, { flag: "wx" });
    const attachment = await prisma.attachment.create({
      data: {
        companyId: context.company.id,
        uploadedById: context.user.id,
        entityType,
        entityId,
        originalName: file.name.slice(0, 240),
        storageKey: relativeKey,
        mimeType: file.type,
        sizeBytes: BigInt(file.size),
        sha256,
        isQuarantined: false,
        scannedAt: new Date(),
      },
    });
    return NextResponse.json(jsonSafe({ data: attachment }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
