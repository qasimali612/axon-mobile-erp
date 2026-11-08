import "server-only";

import { JournalStatus, PartyStatus, Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export type PartyLedgerKind = "customer" | "supplier";
const zero = () => new Prisma.Decimal(0);
const round = (value: Prisma.Decimal) => value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
function daysPastDue(asOf: Date, dueDate: Date) { return Math.floor((asOf.getTime() - dueDate.getTime()) / 86_400_000); }
function bucketFor(asOf: Date, dueDate: Date) {
  const days = daysPastDue(asOf, dueDate);
  if (days <= 0) return "current" as const;
  if (days <= 30) return "days1To30" as const;
  if (days <= 60) return "days31To60" as const;
  if (days <= 90) return "days61To90" as const;
  return "daysOver90" as const;
}
function branchClause(alias: string, branchIds: string[] | null) {
  if (branchIds === null) return Prisma.empty;
  if (!branchIds.length) return Prisma.sql`AND FALSE`;
  if (alias === "l") return Prisma.sql`AND l."branchId"::text IN (${Prisma.join(branchIds)})`;
  if (alias === "d") return Prisma.sql`AND d."branchId"::text IN (${Prisma.join(branchIds)})`;
  return Prisma.sql`AND j."branchId"::text IN (${Prisma.join(branchIds)})`;
}
function idListClause(ids: string[]) { return ids.length ? Prisma.sql`${Prisma.join(ids)}` : Prisma.sql`''`; }

export function parseLedgerDate(value: string | null, label: string, fallback: Date) {
  if (!value) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(422, "INVALID_REPORT_DATE", `${label} must be a valid YYYY-MM-DD date.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ApiError(422, "INVALID_REPORT_DATE", `${label} is not a valid calendar date.`);
  return date;
}

export type AgingTotals = {
  current: Prisma.Decimal;
  days1To30: Prisma.Decimal;
  days31To60: Prisma.Decimal;
  days61To90: Prisma.Decimal;
  daysOver90: Prisma.Decimal;
  documentOpen: Prisma.Decimal;
  residual: Prisma.Decimal;
  balance: Prisma.Decimal;
};
function emptyAging(): AgingTotals { return { current: zero(), days1To30: zero(), days31To60: zero(), days61To90: zero(), daysOver90: zero(), documentOpen: zero(), residual: zero(), balance: zero() }; }

export type OpenItem = {
  id: string;
  number: string;
  documentDate: Date;
  dueDate: Date;
  originalAmount: Prisma.Decimal;
  returnsAmount: Prisma.Decimal;
  allocatedAmount: Prisma.Decimal;
  openAmount: Prisma.Decimal;
  daysPastDue: number;
  bucket: ReturnType<typeof bucketFor>;
  href: string;
};
type RawOpenItem = Omit<OpenItem, "daysPastDue" | "bucket" | "href"> & { partyId: string };

async function ledgerBalances(kind: PartyLedgerKind, companyId: string, partyIds: string[], asOf: Date, branchIds: string[] | null): Promise<Map<string, Prisma.Decimal>> {
  if (!partyIds.length) return new Map();
  const ids = idListClause(partyIds);
  const branches = branchClause("l", branchIds);
  const rows = kind === "customer"
    ? await prisma.$queryRaw<Array<{ partyId: string; balance: Prisma.Decimal }>>(Prisma.sql`
        SELECT l."customerId"::text AS "partyId", COALESCE(SUM(l."baseDebit"-l."baseCredit"),0)::numeric(19,4) AS balance
        FROM "JournalEntryLine" l JOIN "JournalEntry" e ON e."id"=l."entryId" JOIN "Account" a ON a."id"=l."accountId"
        WHERE e."companyId"=${companyId}::uuid AND e."status" IN ('POSTED','REVERSED') AND e."postingDate"<=${asOf}
          AND a."accountType"='ACCOUNTS_RECEIVABLE' AND l."customerId"::text IN (${ids}) ${branches}
        GROUP BY l."customerId"`)
    : await prisma.$queryRaw<Array<{ partyId: string; balance: Prisma.Decimal }>>(Prisma.sql`
        SELECT l."supplierId"::text AS "partyId", COALESCE(SUM(l."baseCredit"-l."baseDebit"),0)::numeric(19,4) AS balance
        FROM "JournalEntryLine" l JOIN "JournalEntry" e ON e."id"=l."entryId" JOIN "Account" a ON a."id"=l."accountId"
        WHERE e."companyId"=${companyId}::uuid AND e."status" IN ('POSTED','REVERSED') AND e."postingDate"<=${asOf}
          AND a."accountType"='ACCOUNTS_PAYABLE' AND l."supplierId"::text IN (${ids}) ${branches}
        GROUP BY l."supplierId"`);
  return new Map(rows.map((row) => [row.partyId, round(row.balance)]));
}

async function openItemsByParty(kind: PartyLedgerKind, companyId: string, partyIds: string[], asOf: Date, branchIds: string[] | null): Promise<Map<string, OpenItem[]>> {
  const result = new Map<string, OpenItem[]>(partyIds.map((id) => [id, []]));
  if (!partyIds.length) return result;
  const ids = idListClause(partyIds);
  const branches = branchClause("d", branchIds);
  const rows = kind === "customer"
    ? await prisma.$queryRaw<RawOpenItem[]>(Prisma.sql`
        WITH open_docs AS (
          SELECT d."id", d."customerId"::text AS "partyId", d."invoiceNumber" AS number,
            d."invoiceDate" AS "documentDate", COALESCE(d."dueDate", (d."invoiceDate" + c."paymentTermsDays" * INTERVAL '1 day')::date) AS "dueDate",
            d."grandTotal" AS "originalAmount", COALESCE(r.amount,0)::numeric(19,4) AS "returnsAmount",
            COALESCE(p.amount,0)::numeric(19,4) AS "allocatedAmount",
            (d."grandTotal"-COALESCE(r.amount,0)-COALESCE(p.amount,0))::numeric(19,4) AS "openAmount"
          FROM "SalesInvoice" d JOIN "Customer" c ON c."id"=d."customerId" JOIN "JournalEntry" dj ON dj."id"=d."journalEntryId"
          LEFT JOIN LATERAL (
            SELECT SUM(sr."grandTotal") AS amount FROM "StockReturn" sr JOIN "JournalEntry" rj ON rj."id"=sr."journalEntryId"
            WHERE sr."salesInvoiceId"=d."id" AND sr."status"='POSTED' AND rj."postingDate"<=${asOf}
          ) r ON TRUE
          LEFT JOIN LATERAL (
            SELECT SUM(CASE pmt."direction" WHEN 'CUSTOMER_RECEIPT' THEN pa."amount" ELSE -pa."amount" END) AS amount
            FROM "PaymentAllocation" pa JOIN "Payment" pmt ON pmt."id"=pa."paymentId" JOIN "JournalEntry" pj ON pj."id"=pmt."journalEntryId"
            WHERE pa."salesInvoiceId"=d."id" AND pmt."status"='POSTED' AND pj."postingDate"<=${asOf}
          ) p ON TRUE
          WHERE d."companyId"=${companyId}::uuid AND d."customerId"::text IN (${ids}) AND d."reversalOfId" IS NULL
            AND d."status" IN ('POSTED','REVERSED') AND d."invoiceDate"<=${asOf} AND dj."postingDate"<=${asOf} ${branches}
            AND NOT EXISTS (SELECT 1 FROM "SalesInvoice" rv JOIN "JournalEntry" rj ON rj."id"=rv."journalEntryId" WHERE rv."reversalOfId"=d."id" AND rv."status"='POSTED' AND rj."postingDate"<=${asOf})
        ) SELECT * FROM open_docs WHERE "openAmount"<>0 ORDER BY "dueDate", "documentDate", number`)
    : await prisma.$queryRaw<RawOpenItem[]>(Prisma.sql`
        WITH open_docs AS (
          SELECT d."id", d."supplierId"::text AS "partyId", d."receiptNumber" AS number,
            d."receiptDate" AS "documentDate", COALESCE(d."dueDate", (d."receiptDate" + s."paymentTermsDays" * INTERVAL '1 day')::date) AS "dueDate",
            d."grandTotal" AS "originalAmount", COALESCE(r.amount,0)::numeric(19,4) AS "returnsAmount",
            COALESCE(p.amount,0)::numeric(19,4) AS "allocatedAmount",
            (d."grandTotal"-COALESCE(r.amount,0)-COALESCE(p.amount,0))::numeric(19,4) AS "openAmount"
          FROM "PurchaseReceipt" d JOIN "Supplier" s ON s."id"=d."supplierId" JOIN "JournalEntry" dj ON dj."id"=d."journalEntryId"
          LEFT JOIN LATERAL (
            SELECT SUM(sr."grandTotal") AS amount FROM "StockReturn" sr JOIN "JournalEntry" rj ON rj."id"=sr."journalEntryId"
            WHERE sr."purchaseReceiptId"=d."id" AND sr."status"='POSTED' AND rj."postingDate"<=${asOf}
          ) r ON TRUE
          LEFT JOIN LATERAL (
            SELECT SUM(CASE pmt."direction" WHEN 'SUPPLIER_PAYMENT' THEN pa."amount" ELSE -pa."amount" END) AS amount
            FROM "PaymentAllocation" pa JOIN "Payment" pmt ON pmt."id"=pa."paymentId" JOIN "JournalEntry" pj ON pj."id"=pmt."journalEntryId"
            WHERE pa."purchaseReceiptId"=d."id" AND pmt."status"='POSTED' AND pj."postingDate"<=${asOf}
          ) p ON TRUE
          WHERE d."companyId"=${companyId}::uuid AND d."supplierId"::text IN (${ids}) AND d."reversalOfId" IS NULL
            AND d."status" IN ('POSTED','REVERSED') AND d."receiptDate"<=${asOf} AND dj."postingDate"<=${asOf} ${branches}
            AND NOT EXISTS (SELECT 1 FROM "PurchaseReceipt" rv JOIN "JournalEntry" rj ON rj."id"=rv."journalEntryId" WHERE rv."reversalOfId"=d."id" AND rv."status"='POSTED' AND rj."postingDate"<=${asOf})
        ) SELECT * FROM open_docs WHERE "openAmount"<>0 ORDER BY "dueDate", "documentDate", number`);
  for (const row of rows) {
    const item: OpenItem = { id: row.id, number: row.number, documentDate: row.documentDate, dueDate: row.dueDate, originalAmount: row.originalAmount, returnsAmount: row.returnsAmount, allocatedAmount: row.allocatedAmount, openAmount: row.openAmount, daysPastDue: daysPastDue(asOf, row.dueDate), bucket: bucketFor(asOf, row.dueDate), href: kind === "customer" ? `/sales/${row.id}` : `/goods-receipts/${row.id}` };
    result.get(row.partyId)?.push(item);
  }
  return result;
}

export type PartyAgingRow = { id: string; code: string; name: string; phone: string | null; status: PartyStatus; paymentTermsDays: number; creditLimit: Prisma.Decimal; aging: AgingTotals; overdue: Prisma.Decimal; openDocumentCount: number };
export type PartyAgingReport = { rows: PartyAgingRow[]; totals: AgingTotals; pagination: { page: number; pageSize: number; total: number } };

export async function getPartyAgingSummary(input: { companyId: string; kind: PartyLedgerKind; asOf: Date; branchIds: string[] | null; search?: string; page: number; pageSize: number }): Promise<PartyAgingReport> {
  type SummaryParty = Omit<PartyAgingRow, "aging" | "overdue" | "openDocumentCount">;
  const filters = [
    ...(input.search ? [{ OR: [{ code: { contains: input.search, mode: Prisma.QueryMode.insensitive } }, { name: { contains: input.search, mode: Prisma.QueryMode.insensitive } }, { phone: { contains: input.search, mode: Prisma.QueryMode.insensitive } }] }] : []),
    ...(input.branchIds ? [{ OR: [{ branchId: null }, { branchId: { in: input.branchIds } }] }] : []),
  ];
  const where = { companyId: input.companyId, ...(filters.length ? { AND: filters } : {}) };
  const pagination = { skip: (input.page - 1) * input.pageSize, take: input.pageSize };
  let parties: SummaryParty[]; let total: number; let allIds: string[];
  if (input.kind === "customer") {
    const [pageRows, count, idRows] = await Promise.all([
      prisma.customer.findMany({ where, select: { id: true, code: true, name: true, phone: true, status: true, paymentTermsDays: true, creditLimit: true }, orderBy: [{ name: "asc" }, { code: "asc" }], ...pagination }),
      prisma.customer.count({ where }),
      prisma.customer.findMany({ where, select: { id: true }, take: 5_001 }),
    ]);
    parties = pageRows; total = count; allIds = idRows.map((row) => row.id);
  } else {
    const [pageRows, count, idRows] = await Promise.all([
      prisma.supplier.findMany({ where, select: { id: true, code: true, name: true, phone: true, status: true, paymentTermsDays: true, creditLimit: true }, orderBy: [{ name: "asc" }, { code: "asc" }], ...pagination }),
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({ where, select: { id: true }, take: 5_001 }),
    ]);
    parties = pageRows; total = count; allIds = idRows.map((row) => row.id);
  }
  if (allIds.length > 5_000) throw new ApiError(422, "REPORT_TOO_LARGE", "This aging report exceeds 5,000 parties. Narrow the search filter.");
  const [balances, items] = await Promise.all([ledgerBalances(input.kind, input.companyId, allIds, input.asOf, input.branchIds), openItemsByParty(input.kind, input.companyId, allIds, input.asOf, input.branchIds)]);
  const agingFor = (partyId: string) => {
    const aging = emptyAging();
    for (const item of items.get(partyId) || []) { aging[item.bucket] = aging[item.bucket].plus(item.openAmount); aging.documentOpen = aging.documentOpen.plus(item.openAmount); }
    aging.balance = balances.get(partyId) || zero(); aging.residual = round(aging.balance.minus(aging.documentOpen));
    for (const key of ["current", "days1To30", "days31To60", "days61To90", "daysOver90", "documentOpen", "residual", "balance"] as const) aging[key] = round(aging[key]);
    return aging;
  };
  const rows = parties.map((party) => { const aging = agingFor(party.id); return { ...party, aging, overdue: round(aging.days1To30.plus(aging.days31To60).plus(aging.days61To90).plus(aging.daysOver90)), openDocumentCount: (items.get(party.id) || []).length }; });
  const totals = allIds.reduce((sum, partyId) => { const aging = agingFor(partyId); for (const key of Object.keys(sum) as Array<keyof AgingTotals>) sum[key] = sum[key].plus(aging[key]); return sum; }, emptyAging());
  return { rows, totals, pagination: { page: input.page, pageSize: input.pageSize, total } };
}

export type PartyStatementTransaction = { id: string; postingDate: Date; voucherNumber: string; voucherType: string; description: string; narration: string; reference: string | null; sourceModule: string; sourceDocumentType: string | null; sourceDocumentId: string | null; sourceDocumentNumber: string | null; journalEntryId: string; journalStatus: JournalStatus; branch: { id: string; code: string; name: string }; debit: Prisma.Decimal; credit: Prisma.Decimal; movement: Prisma.Decimal; runningBalance: Prisma.Decimal };
export type PartyStatementReport = { party: { id: string; code: string; name: string; phone: string | null; email: string | null; address: string | null; status: PartyStatus; creditLimit: Prisma.Decimal; paymentTermsDays: number }; kind: PartyLedgerKind; from: Date; to: Date; openingBalance: Prisma.Decimal; periodDebit: Prisma.Decimal; periodCredit: Prisma.Decimal; closingBalance: Prisma.Decimal; transactions: PartyStatementTransaction[]; openItems: OpenItem[]; aging: AgingTotals };
type RawStatementLine = Omit<PartyStatementTransaction, "branch" | "movement" | "runningBalance"> & { branchId: string; branchCode: string; branchName: string };

export async function getPartyStatement(input: { companyId: string; kind: PartyLedgerKind; partyId: string; from: Date; to: Date; branchIds: string[] | null }): Promise<PartyStatementReport> {
  if (input.from > input.to) throw new ApiError(422, "INVALID_DATE_RANGE", "Statement start date cannot be after the end date.");
  const scope = input.branchIds ? { OR: [{ branchId: null }, { branchId: { in: input.branchIds } }] } : {};
  const party = input.kind === "customer"
    ? await prisma.customer.findFirst({ where: { id: input.partyId, companyId: input.companyId, ...scope }, select: { id: true, code: true, name: true, phone: true, email: true, address: true, status: true, creditLimit: true, paymentTermsDays: true } })
    : await prisma.supplier.findFirst({ where: { id: input.partyId, companyId: input.companyId, ...scope }, select: { id: true, code: true, name: true, phone: true, email: true, address: true, status: true, creditLimit: true, paymentTermsDays: true } });
  if (!party) throw new ApiError(404, "PARTY_NOT_FOUND", `${input.kind === "customer" ? "Customer" : "Supplier"} was not found in the allowed scope.`);
  const branches = branchClause("l", input.branchIds);
  const controlType = input.kind === "customer" ? "ACCOUNTS_RECEIVABLE" : "ACCOUNTS_PAYABLE";
  const partyPredicate = input.kind === "customer" ? Prisma.sql`l."customerId"=${input.partyId}::uuid` : Prisma.sql`l."supplierId"=${input.partyId}::uuid`;
  const aggregates = await prisma.$queryRaw<Array<{ openingDebit: Prisma.Decimal; openingCredit: Prisma.Decimal; periodDebit: Prisma.Decimal; periodCredit: Prisma.Decimal }>>(Prisma.sql`
    SELECT
      COALESCE(SUM(l."baseDebit") FILTER (WHERE e."postingDate"<${input.from}),0)::numeric(19,4) AS "openingDebit",
      COALESCE(SUM(l."baseCredit") FILTER (WHERE e."postingDate"<${input.from}),0)::numeric(19,4) AS "openingCredit",
      COALESCE(SUM(l."baseDebit") FILTER (WHERE e."postingDate">=${input.from} AND e."postingDate"<=${input.to}),0)::numeric(19,4) AS "periodDebit",
      COALESCE(SUM(l."baseCredit") FILTER (WHERE e."postingDate">=${input.from} AND e."postingDate"<=${input.to}),0)::numeric(19,4) AS "periodCredit"
    FROM "JournalEntryLine" l JOIN "JournalEntry" e ON e."id"=l."entryId" JOIN "Account" a ON a."id"=l."accountId"
    WHERE e."companyId"=${input.companyId}::uuid AND e."status" IN ('POSTED','REVERSED') AND e."postingDate"<=${input.to}
      AND a."accountType"=${controlType} AND ${partyPredicate} ${branches}`);
  const rawLines = await prisma.$queryRaw<RawStatementLine[]>(Prisma.sql`
    SELECT l."id", e."postingDate", e."voucherNumber", e."voucherType"::text AS "voucherType", l."description", e."narration",
      e."referenceDocument" AS reference, e."sourceModule", e."sourceDocumentType", e."sourceDocumentId", e."sourceDocumentNumber",
      e."id"::text AS "journalEntryId", e."status"::text AS "journalStatus", b."id"::text AS "branchId", b."code" AS "branchCode", b."name" AS "branchName",
      l."baseDebit" AS debit, l."baseCredit" AS credit
    FROM "JournalEntryLine" l JOIN "JournalEntry" e ON e."id"=l."entryId" JOIN "Account" a ON a."id"=l."accountId" JOIN "Branch" b ON b."id"=l."branchId"
    WHERE e."companyId"=${input.companyId}::uuid AND e."status" IN ('POSTED','REVERSED') AND e."postingDate">=${input.from} AND e."postingDate"<=${input.to}
AND a."accountType"=${controlType} AND ${partyPredicate} ${branches}
    ORDER BY e."postingDate", e."voucherNumber", l."lineNumber" LIMIT 5001`);
  if (rawLines.length > 5_000) throw new ApiError(422, "REPORT_TOO_LARGE", "This statement exceeds 5,000 lines. Select a shorter date range.");
  const aggregate = aggregates[0] || { openingDebit: zero(), openingCredit: zero(), periodDebit: zero(), periodCredit: zero() };
  const balanceEffect = (debit: Prisma.Decimal, credit: Prisma.Decimal) => input.kind === "customer" ? debit.minus(credit) : credit.minus(debit);
  const openingBalance = round(balanceEffect(aggregate.openingDebit, aggregate.openingCredit));
  let runningBalance = openingBalance;
  const transactions = rawLines.map((line) => {
    const movement = round(balanceEffect(line.debit, line.credit)); runningBalance = round(runningBalance.plus(movement));
    return { id: line.id, postingDate: line.postingDate, voucherNumber: line.voucherNumber, voucherType: line.voucherType, description: line.description, narration: line.narration, reference: line.reference, sourceModule: line.sourceModule, sourceDocumentType: line.sourceDocumentType, sourceDocumentId: line.sourceDocumentId, sourceDocumentNumber: line.sourceDocumentNumber, journalEntryId: line.journalEntryId, journalStatus: line.journalStatus, branch: { id: line.branchId, code: line.branchCode, name: line.branchName }, debit: line.debit, credit: line.credit, movement, runningBalance };
  });
  const openItems = (await openItemsByParty(input.kind, input.companyId, [input.partyId], input.to, input.branchIds)).get(input.partyId) || [];
  const aging = emptyAging();
  for (const item of openItems) { aging[item.bucket] = aging[item.bucket].plus(item.openAmount); aging.documentOpen = aging.documentOpen.plus(item.openAmount); }
  aging.balance = runningBalance; aging.residual = round(runningBalance.minus(aging.documentOpen));
  return { party, kind: input.kind, from: input.from, to: input.to, openingBalance, periodDebit: round(aggregate.periodDebit), periodCredit: round(aggregate.periodCredit), closingBalance: runningBalance, transactions, openItems, aging };
}
