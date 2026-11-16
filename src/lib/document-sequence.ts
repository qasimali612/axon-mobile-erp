import { Prisma } from "@prisma/client";

/**
 * Sanitizes a branch prefix by stripping leading/trailing hyphens and non-alphanumeric characters.
 * Defaults to "BR" if the result is empty.
 */
export function sanitizeBranchPrefix(raw?: string | null): string {
  const sanitized = (raw || "BR").trim().replace(/[^A-Za-z0-9]/g, "");
  return sanitized || "BR";
}

/**
 * Sanitizes a document suffix by stripping non-alphanumeric characters.
 * Defaults to "DOC" if the result is empty.
 */
export function sanitizeDocumentSuffix(raw?: string | null): string {
  const sanitized = (raw || "DOC").trim().replace(/[^A-Za-z0-9]/g, "");
  return sanitized || "DOC";
}

/**
 * Sanitizes any prefix string (e.g. "ISB--RC" -> "ISB-RC") to ensure single-hyphen separated alphanumeric segments.
 */
export function sanitizePrefix(prefix: string): string {
  const parts = prefix
    .split("-")
    .map((part) => part.trim().replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  return parts.length > 0 ? parts.join("-") : "BR-DOC";
}

/**
 * Formats a clean single-hyphen prefix from branch and suffix: `${cleanBranch}-${cleanSuffix}`.
 */
export function formatDocumentPrefix(branchPrefix?: string | null, suffix?: string | null): string {
  const cleanBranch = sanitizeBranchPrefix(branchPrefix);
  const cleanSuffix = sanitizeDocumentSuffix(suffix);
  return `${cleanBranch}-${cleanSuffix}`;
}

/**
 * Formats a single-hyphen document sequence number:
 * `${cleanBranch}-${cleanSuffix}-${fiscalYear}-${seq}`
 */
export function formatDocumentNumber(input: {
  branchPrefix?: string | null;
  suffix?: string | null;
  fiscalYear: string;
  sequenceNumber: number | bigint;
  padding?: number;
}): string {
  const prefix = formatDocumentPrefix(input.branchPrefix, input.suffix);
  const pad = input.padding ?? 6;
  const seqStr = input.sequenceNumber.toString().padStart(pad, "0");
  return `${prefix}-${input.fiscalYear}-${seqStr}`;
}

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
  const cleanPrefix = sanitizePrefix(input.prefix);
  const pad = input.padding ?? 6;

  const rows = await tx.$queryRaw<Array<{ nextValue: bigint; prefix: string; padding: number }>>`
    INSERT INTO "DocumentSequence"
      ("id", "companyId", "branchId", "documentType", "prefix", "fiscalYear", "nextValue", "padding", "version", "createdAt", "updatedAt")
    VALUES
      (${crypto.randomUUID()}::uuid, ${input.companyId}::uuid, ${input.branchId ?? null}::uuid,
       ${input.documentType}, ${cleanPrefix}, ${input.fiscalYear}, 2, ${pad}, 1, NOW(), NOW())
    ON CONFLICT ("companyId", "branchId", "documentType", "fiscalYear")
    DO UPDATE SET
      "nextValue" = "DocumentSequence"."nextValue" + 1,
      "prefix" = ${cleanPrefix},
      "version" = "DocumentSequence"."version" + 1,
      "updatedAt" = NOW()
    RETURNING "nextValue" - 1 AS "nextValue", "prefix", "padding"
  `;

  const allocated = rows[0];
  if (!allocated) throw new Error("Document sequence allocation failed.");
  const finalPad = allocated.padding ?? pad;
  return `${cleanPrefix}-${input.fiscalYear}-${allocated.nextValue.toString().padStart(finalPad, "0")}`;
}

/**
 * Strict regex pattern for single-hyphen sequence formatting:
 * e.g. ISB-SI-FY2026-27-000001 or ISB-RC-FY2026-27-000001
 * Matches: ^[A-Z0-9]+-[A-Z0-9]+-FY[0-9]{4}-[0-9]{2}-[0-9]{6}$
 */
export const DOCUMENT_SEQUENCE_REGEX = /^[A-Z0-9]+-[A-Z0-9]+-FY[0-9]{4}-[0-9]{2}-[0-9]{6}$/;

/**
 * Historical document number format with legacy double hyphens.
 * (e.g. ISB--SI-FY2026-27-000004, ISB--RC-FY2026-27-000001 through 000006)
 * These records are strictly preserved without modification.
 */
export const HISTORICAL_DOCUMENT_SEQUENCE_REGEX = /^[A-Z0-9]+--[A-Z0-9]+-FY[0-9]{4}-[0-9]{2}-[0-9]{6}$/;

/**
 * Validates whether a document number conforms to standard single-hyphen sequence formatting.
 */
export function isValidDocumentSequence(documentNumber: string): boolean {
  return DOCUMENT_SEQUENCE_REGEX.test(documentNumber);
}

/**
 * Checks whether a document number is a legacy historical sequence number that must be preserved.
 */
export function isHistoricalDocumentSequence(documentNumber: string): boolean {
  return HISTORICAL_DOCUMENT_SEQUENCE_REGEX.test(documentNumber);
}

