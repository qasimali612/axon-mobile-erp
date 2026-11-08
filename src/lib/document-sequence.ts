import { Prisma } from "@prisma/client";

/**
 * Allocates a number under a row lock. Call from the transaction that creates
 * the document so failed transactions do not consume or duplicate numbers.
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    branchId: string;
    documentType: string;
    fiscalYear: string;
    prefix: string;
    padding?: number;
  },
) {
  const rows = await tx.$queryRaw<Array<{ nextValue: bigint; prefix: string; padding: number }>>`
    INSERT INTO "DocumentSequence"
      ("id", "companyId", "branchId", "documentType", "prefix", "fiscalYear", "nextValue", "padding", "version", "createdAt", "updatedAt")
    VALUES
      (${crypto.randomUUID()}::uuid, ${input.companyId}::uuid, ${input.branchId ?? null}::uuid,
       ${input.documentType}, ${input.prefix}, ${input.fiscalYear}, 2, ${input.padding ?? 6}, 1, NOW(), NOW())
    ON CONFLICT ("companyId", "branchId", "documentType", "fiscalYear")
    DO UPDATE SET
      "nextValue" = "DocumentSequence"."nextValue" + 1,
      "version" = "DocumentSequence"."version" + 1,
      "updatedAt" = NOW()
    RETURNING "nextValue" - 1 AS "nextValue", "prefix", "padding"
  `;

  const allocated = rows[0];
  if (!allocated) throw new Error("Document sequence allocation failed.");
  return `${allocated.prefix}-${input.fiscalYear}-${allocated.nextValue.toString().padStart(allocated.padding, "0")}`;
}
