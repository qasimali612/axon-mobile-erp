import "server-only";

import { Prisma, RebateDirection, RebateStatus } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { decimal, zero } from "@/lib/finance/money";
import { resolveSettlement } from "@/lib/finance/settlement";
import { postSystemJournal } from "@/lib/finance/system-journal";
import { assertMakerChecker } from "@/lib/operating-mode";
import { prisma } from "@/lib/prisma";
import type { RebateItem } from "@/lib/finance/rebate-validation";

export type RebateActor = { companyId: string; userId: string; currencyCode: string };

export type RebateProgramInput = {
  code: string;
  name: string;
  direction: "RECEIVABLE" | "PAYABLE";
  supplierId?: string | null;
  customerId?: string | null;
  effectiveFrom: string;
  effectiveTo: string;
  calculationMethod: "PERCENT_OF_VALUE" | "PER_UNIT" | "FIXED_AMOUNT" | "PRICE_PROTECTION" | "COMPANY_PRICE_REDUCTION" | "PURCHASE_REBATE" | "PROMOTIONAL_REBATE" | "VOLUME_REBATE" | "SPECIAL_ADJUSTMENT";
  rate?: string | null;
  fixedAmount?: string | null;
  primaryAccountId: string;
  settlementAccountId: string;
  accountingTreatment: "INCOME" | "COST_REDUCTION";
  isActive: boolean;
  rules?: Record<string, any> | null;
};

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const isoDate = (value: Date) => value.toISOString().slice(0, 10);

async function requireAccount(tx: Prisma.TransactionClient, companyId: string, id: string, label: string, classes: string[]) {
  const account = await tx.account.findFirst({ where: { id, companyId, isActive: true }, select: { id: true, code: true, name: true, accountClass: true } });
  if (!account) throw new ApiError(422, "INVALID_ACCOUNT", `${label} must be an active account in this company.`);
  if (!classes.includes(account.accountClass)) throw new ApiError(422, "INVALID_ACCOUNT_CLASS", `${label} (${account.code} ${account.name}) must be a ${classes.join(" or ").toLowerCase()} account.`);
  return account;
}

export async function saveRebateProgram(actor: RebateActor, input: RebateProgramInput, id?: string) {
  const receivable = input.direction === "RECEIVABLE";
  await prisma.$transaction(async (tx) => {
    await requireAccount(tx, actor.companyId, input.primaryAccountId, "Primary account", receivable ? ["REVENUE"] : ["EXPENSE"]);
    await requireAccount(tx, actor.companyId, input.settlementAccountId, "Settlement account", receivable ? ["ASSET"] : ["LIABILITY"]);
    if (receivable) {
      const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId ?? "", companyId: actor.companyId, status: "ACTIVE" }, select: { id: true } });
      if (!supplier) throw new ApiError(422, "INVALID_SUPPLIER", "Select an active supplier for a supplier rebate.");
    } else {
      const customer = await tx.customer.findFirst({ where: { id: input.customerId ?? "", companyId: actor.companyId, status: "ACTIVE" }, select: { id: true } });
      if (!customer) throw new ApiError(422, "INVALID_CUSTOMER", "Select an active customer for a customer rebate.");
    }
  });
  const data = {
    name: input.name,
    direction: input.direction as RebateDirection,
    supplierId: input.supplierId ?? null,
    customerId: input.customerId ?? null,
    effectiveFrom: toDate(input.effectiveFrom),
    effectiveTo: toDate(input.effectiveTo),
    calculationMethod: input.calculationMethod,
    rate: input.rate ? decimal(input.rate) : null,
    fixedAmount: input.fixedAmount ? decimal(input.fixedAmount) : null,
    primaryAccountId: input.primaryAccountId,
    settlementAccountId: input.settlementAccountId,
    accountingTreatment: input.accountingTreatment,
    isActive: input.isActive,
    rules: (input.rules as Prisma.InputJsonValue) ?? Prisma.JsonNull,
  };
  if (id) {
    const existing = await prisma.rebateProgram.findFirst({ where: { id, companyId: actor.companyId } });
    if (!existing) throw new ApiError(404, "REBATE_PROGRAM_NOT_FOUND", "Rebate program was not found.");
    if (existing.code !== input.code) throw new ApiError(422, "PROGRAM_CODE_IMMUTABLE", "The program code cannot be changed after creation.");
    const updated = await prisma.rebateProgram.update({ where: { id }, data });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, action: "REBATE_PROGRAM_UPDATED", module: "finance", entityType: "RebateProgram", entityId: id, entityReference: existing.code, previousValues: { rate: existing.rate?.toString() ?? null, fixedAmount: existing.fixedAmount?.toString() ?? null, isActive: existing.isActive }, newValues: { rate: data.rate?.toString() ?? null, fixedAmount: data.fixedAmount?.toString() ?? null, isActive: data.isActive } });
    return updated;
  }
  const created = await prisma.rebateProgram.create({ data: { ...data, code: input.code, companyId: actor.companyId } });
  await appendAudit({ companyId: actor.companyId, actorId: actor.userId, action: "REBATE_PROGRAM_CREATED", module: "finance", entityType: "RebateProgram", entityId: created.id, entityReference: created.code, newValues: { direction: created.direction, calculationMethod: created.calculationMethod, rate: created.rate?.toString() ?? null } });
  return created;
}

type Eligibility = { value: Prisma.Decimal; quantity: Prisma.Decimal; documents: number };

async function collectEligibility(program: { companyId: string; direction: RebateDirection; supplierId: string | null; customerId: string | null }, periodStart: Date, periodEnd: Date): Promise<Eligibility> {
  if (program.direction === RebateDirection.RECEIVABLE) {
    const receipts = await prisma.purchaseReceipt.findMany({
      where: { companyId: program.companyId, supplierId: program.supplierId ?? "", status: "POSTED", receiptDate: { gte: periodStart, lte: periodEnd } },
      select: { id: true, subtotal: true, discountTotal: true, documentDiscount: true, lines: { select: { quantity: true } } },
      take: 20_000,
    });
    let value = zero();
    let quantity = zero();
    for (const receipt of receipts) {
      value = value.plus(receipt.subtotal.minus(receipt.discountTotal).minus(receipt.documentDiscount));
      quantity = quantity.plus(receipt.lines.reduce((sum, line) => sum.plus(line.quantity), zero()));
    }
    return { value, quantity, documents: receipts.length };
  }
  const invoices = await prisma.salesInvoice.findMany({
    where: { companyId: program.companyId, customerId: program.customerId ?? "", status: "POSTED", invoiceDate: { gte: periodStart, lte: periodEnd } },
    select: { id: true, subtotal: true, discountTotal: true, lines: { select: { quantity: true } } },
    take: 20_000,
  });
  const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
  const returns = await prisma.stockReturn.findMany({
    where: { companyId: program.companyId, status: "POSTED", returnType: "SALES_RETURN", returnDate: { gte: periodStart, lte: periodEnd }, salesInvoiceId: { in: [...invoiceIds] } },
    select: { id: true, subtotal: true, discountTotal: true, lines: { select: { quantity: true } } },
    take: 20_000,
  });
  let value = zero();
  let quantity = zero();
  for (const invoice of invoices) {
    const net = invoice.subtotal.minus(invoice.discountTotal);
    if (net.lte(0)) continue;
    value = value.plus(net);
    quantity = quantity.plus(invoice.lines.reduce((sum, line) => sum.plus(line.quantity), zero()));
  }
  for (const row of returns) {
    value = value.minus(row.subtotal.minus(row.discountTotal));
    quantity = quantity.minus(row.lines.reduce((sum, line) => sum.plus(line.quantity), zero()));
  }
  return { value, quantity, documents: invoices.length + returns.length };
}

export async function calculateRebate(
  actor: RebateActor,
  programId: string,
  input: {
    periodStart: string;
    periodEnd: string;
    items?: RebateItem[];
    title?: string | null;
    supportingDocRef?: string | null;
    remarks?: string | null;
    submitImmediately?: boolean;
  }
) {
  const periodStart = toDate(input.periodStart);
  const periodEnd = toDate(input.periodEnd);
  const program = await prisma.rebateProgram.findFirst({ where: { id: programId, companyId: actor.companyId } });
  if (!program) throw new ApiError(404, "REBATE_PROGRAM_NOT_FOUND", "Rebate program was not found.");
  if (!program.isActive) throw new ApiError(409, "PROGRAM_INACTIVE", "An inactive rebate program cannot be calculated.");
  if (periodStart < program.effectiveFrom || periodEnd > program.effectiveTo) {
    throw new ApiError(422, "PERIOD_OUTSIDE_PROGRAM", `The calculation period must fall inside the program's effective dates (${isoDate(program.effectiveFrom)} → ${isoDate(program.effectiveTo)}).`);
  }

  const prefix = ["PRICE_PROTECTION", "COMPANY_PRICE_REDUCTION"].includes(program.calculationMethod) ? "RP" : "RB";
  const uniqueSuffix = Date.now().toString().slice(-6);
  const reference = `${prefix}-${program.code}-${isoDate(periodEnd)}-${uniqueSuffix}`.slice(0, 60);

  let eligibleQuantity = zero();
  let eligibleValue = zero();
  let calculatedAmount = zero();
  let calculationDetails: Prisma.InputJsonValue;

  if (["PRICE_PROTECTION", "COMPANY_PRICE_REDUCTION"].includes(program.calculationMethod)) {
    if (!input.items || input.items.length === 0) {
      throw new ApiError(422, "ITEMS_REQUIRED", "Rate protection requires at least one product with eligible inventory and price drop.");
    }
    const processedItems = input.items.map((item) => {
      const qty = decimal(String(item.claimedQuantity ?? item.eligibleQuantity));
      const oldP = decimal(String(item.oldPrice));
      const newP = decimal(String(item.newPrice));
      const drop = oldP.minus(newP);
      const claim = decimal(String(item.claimAmount || qty.mul(drop)));
      eligibleQuantity = eligibleQuantity.plus(qty);
      eligibleValue = eligibleValue.plus(qty.mul(oldP));
      calculatedAmount = calculatedAmount.plus(claim);

      return {
        ...item,
        claimedQuantity: Number(qty),
        remainingQuantity: Math.max(0, Number(item.eligibleQuantity) - Number(qty)),
        priceDropPerUnit: Number(drop),
        claimAmount: Number(claim),
        approvedAmount: Number(claim),
        outstandingAmount: Number(claim),
        status: "PENDING",
      };
    });

    calculatedAmount = calculatedAmount.toDecimalPlaces(4);
    if (calculatedAmount.lte(0)) {
      throw new ApiError(422, "INVALID_CLAIM_AMOUNT", "The calculated rate protection claim amount must be greater than zero.");
    }

    calculationDetails = {
      calculationMethod: program.calculationMethod,
      title: input.title || `Price Protection Claim · ${program.name}`,
      supportingDocRef: input.supportingDocRef || null,
      remarks: input.remarks || null,
      items: processedItems,
      totalItems: processedItems.length,
      eligibleValue: eligibleValue.toDecimalPlaces(4).toString(),
      eligibleQuantity: eligibleQuantity.toDecimalPlaces(4).toString(),
      calculatedAmount: calculatedAmount.toString(),
      submittedAt: input.submitImmediately ? new Date().toISOString() : null,
    };
  } else {
    const eligibility = await collectEligibility(program, periodStart, periodEnd);
    if (eligibility.value.lte(0)) throw new ApiError(422, "NO_ELIGIBLE_DOCUMENTS", "No posted documents in the period qualify for this rebate.");
    let calculated = zero();
    if (program.calculationMethod === "PERCENT_OF_VALUE") calculated = eligibility.value.mul(program.rate ?? zero()).div(100);
    else if (program.calculationMethod === "PER_UNIT") calculated = eligibility.quantity.mul(program.fixedAmount ?? zero());
    else calculated = program.fixedAmount ?? zero();
    calculatedAmount = calculated.toDecimalPlaces(4);
    eligibleQuantity = eligibility.quantity.toDecimalPlaces(4);
    eligibleValue = eligibility.value.toDecimalPlaces(4);
    calculationDetails = {
      calculationMethod: program.calculationMethod,
      rate: program.rate?.toString() ?? null,
      fixedAmount: program.fixedAmount?.toString() ?? null,
      documents: eligibility.documents,
      eligibleValue: eligibility.value.toDecimalPlaces(4).toString(),
      eligibleQuantity: eligibility.quantity.toDecimalPlaces(4).toString(),
      calculatedAmount: calculatedAmount.toString(),
      title: input.title || null,
      remarks: input.remarks || null,
    };
  }

  const initialStatus = input.submitImmediately ? RebateStatus.SUBMITTED : RebateStatus.CALCULATED;

  return prisma.$transaction(async (tx) => {
    const created = await tx.rebateCalculation.create({
      data: {
        companyId: actor.companyId,
        programId: program.id,
        supplierId: program.supplierId,
        customerId: program.customerId,
        referenceNumber: reference,
        periodStart,
        periodEnd,
        eligibleQuantity,
        eligibleValue,
        calculatedAmount,
        approvedAmount: zero(),
        settledAmount: zero(),
        outstandingAmount: zero(),
        status: initialStatus,
        calculationDetails,
        calculatedById: actor.userId,
      },
    });
    await appendAudit(
      {
        companyId: actor.companyId,
        actorId: actor.userId,
        action: input.submitImmediately ? "REBATE_SUBMITTED" : "REBATE_CALCULATED",
        module: "finance",
        entityType: "RebateCalculation",
        entityId: created.id,
        entityReference: reference,
        newValues: {
          eligibleValue: eligibleValue.toDecimalPlaces(4).toString(),
          calculatedAmount: calculatedAmount.toFixed(4),
          status: initialStatus,
        },
      },
      tx
    );
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
}

export async function approveRebate(actor: RebateActor, id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RebateCalculation" WHERE "id" = ${id}::uuid AND "companyId" = ${actor.companyId}::uuid FOR UPDATE`);
    const calculation = await tx.rebateCalculation.findFirst({ where: { id, companyId: actor.companyId } });
    if (!calculation) throw new ApiError(404, "REBATE_CALCULATION_NOT_FOUND", "Rebate calculation was not found.");
    if (calculation.status !== RebateStatus.CALCULATED && calculation.status !== RebateStatus.SUBMITTED) {
      throw new ApiError(409, "INVALID_REBATE_STATE", "Only a calculated or submitted rebate can be approved.");
    }
    await assertMakerChecker(tx, actor.companyId, calculation.calculatedById, actor.userId, "approve this rebate");
    if (calculation.calculatedAmount.lte(0)) throw new ApiError(422, "INVALID_REBATE_AMOUNT", "The rebate amount must be above zero.");

    // Update item statuses inside JSON details if present
    const details = (calculation.calculationDetails as Record<string, any>) || {};
    if (Array.isArray(details.items)) {
      details.items = details.items.map((item: any) => ({
        ...item,
        status: "APPROVED",
        approvedQuantity: item.claimedQuantity ?? item.eligibleQuantity,
        approvedAmount: item.claimAmount,
      }));
    }

    const updated = await tx.rebateCalculation.update({
      where: { id },
      data: {
        status: RebateStatus.APPROVED,
        approvedAmount: calculation.calculatedAmount,
        approvedById: actor.userId,
        approvedAt: new Date(),
        calculationDetails: details,
      },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, action: "REBATE_APPROVED", module: "finance", entityType: "RebateCalculation", entityId: id, entityReference: calculation.referenceNumber, newValues: { approvedAmount: calculation.calculatedAmount.toFixed(4) } }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

export async function rejectRebate(actor: RebateActor, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RebateCalculation" WHERE "id" = ${id}::uuid AND "companyId" = ${actor.companyId}::uuid FOR UPDATE`);
    const calculation = await tx.rebateCalculation.findFirst({ where: { id, companyId: actor.companyId } });
    if (!calculation) throw new ApiError(404, "REBATE_CALCULATION_NOT_FOUND", "Rebate calculation was not found.");
    if (calculation.status !== RebateStatus.CALCULATED && calculation.status !== RebateStatus.SUBMITTED) {
      throw new ApiError(409, "INVALID_REBATE_STATE", "Only a calculated or submitted rebate can be rejected.");
    }
    const details = (calculation.calculationDetails as Record<string, any>) || {};
    if (Array.isArray(details.items)) {
      details.items = details.items.map((item: any) => ({
        ...item,
        status: "REJECTED",
        rejectionReason: reason,
      }));
    }
    details.rejectionReason = reason;
    details.rejectedById = actor.userId;
    details.rejectedAt = new Date().toISOString();

    const updated = await tx.rebateCalculation.update({
      where: { id },
      data: {
        status: RebateStatus.REJECTED,
        calculationDetails: details,
      },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, action: "REBATE_REJECTED", module: "finance", entityType: "RebateCalculation", entityId: id, entityReference: calculation.referenceNumber, newValues: { status: "REJECTED", reason } }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

export async function accrueRebate(actor: RebateActor, id: string, input: { postingDate?: string }) {
  const postingDate = input.postingDate ? toDate(input.postingDate) : new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RebateCalculation" WHERE "id" = ${id}::uuid AND "companyId" = ${actor.companyId}::uuid FOR UPDATE`);
    const calculation = await tx.rebateCalculation.findFirst({ where: { id, companyId: actor.companyId }, include: { program: true, receivable: true, payable: true } });
    if (!calculation) throw new ApiError(404, "REBATE_CALCULATION_NOT_FOUND", "Rebate calculation was not found.");
    if (calculation.status !== RebateStatus.APPROVED) throw new ApiError(409, "INVALID_REBATE_STATE", "Only an approved rebate can be accrued.");
    if (calculation.receivable || calculation.payable) throw new ApiError(409, "REBATE_ALREADY_ACCRUED", "This rebate already has a settlement record.");
    const branch = await tx.branch.findFirst({ where: { companyId: actor.companyId, isActive: true }, select: { id: true }, orderBy: { code: "asc" } });
    if (!branch) throw new ApiError(409, "BRANCH_REQUIRED", "No active branch is available for the accrual.");
    const amount = calculation.approvedAmount;
    const receivable = calculation.program.direction === RebateDirection.RECEIVABLE;

    const journal = await postSystemJournal(tx, {
      actor,
      preparedById: calculation.calculatedById ?? "",
      branchId: branch.id,
      postingDate,
      sourceModule: "REBATE",
      sourceDocumentType: receivable ? "REBATE_RECEIVABLE_ACCRUAL" : "REBATE_PAYABLE_ACCRUAL",
      sourceDocumentId: calculation.id,
      sourceDocumentNumber: calculation.referenceNumber,
      narration: `${receivable ? "Supplier rebate receivable" : "Customer rebate payable"} · ${calculation.program.code} · ${isoDate(calculation.periodStart)} – ${isoDate(calculation.periodEnd)}`,
      reference: calculation.referenceNumber,
      documentTypePrefix: "REBATE",
      numberSuffix: receivable ? "RBR" : "RBP",
      lines: receivable
        ? [
          { accountId: calculation.program.settlementAccountId, description: `Supplier rebate receivable ${calculation.referenceNumber}`, debit: amount.toFixed(4) },
          { accountId: calculation.program.primaryAccountId, description: `Supplier rebate income ${calculation.referenceNumber}`, credit: amount.toFixed(4) },
        ]
        : [
          { accountId: calculation.program.primaryAccountId, description: `Customer rebate ${calculation.referenceNumber}`, debit: amount.toFixed(4) },
          { accountId: calculation.program.settlementAccountId, description: `Customer rebate payable ${calculation.referenceNumber}`, credit: amount.toFixed(4) },
        ],
    });

    if (receivable) {
      await tx.rebateReceivable.create({ data: { calculationId: calculation.id, accrualJournalId: journal.id, accruedAmount: amount, receivedAmount: zero(), outstandingAmount: amount } });
    } else {
      await tx.rebatePayable.create({ data: { calculationId: calculation.id, accrualJournalId: journal.id, accruedAmount: amount, paidAmount: zero(), outstandingAmount: amount } });
    }
    const updated = await tx.rebateCalculation.update({ where: { id }, data: { status: RebateStatus.ACCRUED, accrualJournalId: journal.id, outstandingAmount: amount } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: branch.id, action: "REBATE_ACCRUED", module: "finance", entityType: "RebateCalculation", entityId: id, entityReference: calculation.referenceNumber, newValues: { direction: receiptDirectionLabel(receivable), amount: amount.toFixed(4), journal: journal.voucherNumber } }, tx);
    return { calculation: updated, journal };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

function receiptDirectionLabel(receivable: boolean) {
  return receivable ? "RECEIVABLE" : "PAYABLE";
}

export async function settleRebate(
  actor: RebateActor,
  id: string,
  input: {
    amount: string;
    settlementDate: string;
    paymentMethodId: string;
    bankAccountId?: string | null;
    reference?: string | null;
    notes?: string | null;
    itemAllocations?: Array<{ variantId: string; allocatedAmount: number }>;
  }
) {
  const settlementDate = toDate(input.settlementDate);
  const amount = decimal(input.amount);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RebateCalculation" WHERE "id" = ${id}::uuid AND "companyId" = ${actor.companyId}::uuid FOR UPDATE`);
    const calculation = await tx.rebateCalculation.findFirst({ where: { id, companyId: actor.companyId }, include: { program: true, receivable: true, payable: true } });
    if (!calculation) throw new ApiError(404, "REBATE_CALCULATION_NOT_FOUND", "Rebate calculation was not found.");
    if (calculation.status !== RebateStatus.ACCRUED && calculation.status !== RebateStatus.PARTIALLY_SETTLED) throw new ApiError(409, "INVALID_REBATE_STATE", "Only an accrued rebate can be settled.");
    if (amount.lte(0)) throw new ApiError(422, "INVALID_SETTLEMENT_AMOUNT", "The settlement amount must be above zero.");
    if (amount.gt(calculation.outstandingAmount)) throw new ApiError(422, "SETTLEMENT_EXCEEDS_OUTSTANDING", `The settlement exceeds the outstanding balance of ${calculation.outstandingAmount.toFixed(4)}.`);
    const settlement = await resolveSettlement(tx, actor, input);
    const branchId = settlement.branchId ?? (await tx.branch.findFirst({ where: { companyId: actor.companyId, isActive: true }, select: { id: true }, orderBy: { code: "asc" } }))?.id;
    if (!branchId) throw new ApiError(409, "BRANCH_REQUIRED", "No active branch is available for the settlement.");
    const settlementId = crypto.randomUUID();
    const receivable = Boolean(calculation.receivable);

    const journal = await postSystemJournal(tx, {
      actor,
      preparedById: calculation.approvedById ?? calculation.calculatedById ?? "",
      branchId,
      postingDate: settlementDate,
      sourceModule: "REBATE",
      sourceDocumentType: receivable ? "REBATE_RECEIPT" : "REBATE_PAYMENT",
      sourceDocumentId: settlementId,
      sourceDocumentNumber: calculation.referenceNumber,
      narration: `${receivable ? "Supplier rebate received" : "Customer rebate paid"} · ${calculation.program.code} · ${settlement.methodName}`,
      reference: calculation.referenceNumber,
      documentTypePrefix: "REBATE",
      numberSuffix: receivable ? "RBRC" : "RBPM",
      lines: receivable
        ? [
          { accountId: settlement.glAccountId, description: `Supplier rebate received via ${settlement.methodName}`, debit: amount.toFixed(4) },
          { accountId: calculation.program.settlementAccountId, description: `Supplier rebate receivable settled ${calculation.referenceNumber}`, credit: amount.toFixed(4) },
        ]
        : [
          { accountId: calculation.program.settlementAccountId, description: `Customer rebate payable settled ${calculation.referenceNumber}`, debit: amount.toFixed(4) },
          { accountId: settlement.glAccountId, description: `Customer rebate paid via ${settlement.methodName}`, credit: amount.toFixed(4) },
        ],
    });

    if (receivable && calculation.receivable) {
      await tx.rebateReceipt.create({ data: { receivableId: calculation.receivable.id, bankAccountId: settlement.bankAccountId, journalEntryId: journal.id, receiptDate: settlementDate, receiptMethod: settlement.methodCode, reference: input.reference ?? null, amount } });
      const received = calculation.receivable.receivedAmount.plus(amount);
      await tx.rebateReceivable.update({ where: { id: calculation.receivable.id }, data: { receivedAmount: received, outstandingAmount: calculation.receivable.accruedAmount.minus(received) } });
    } else if (calculation.payable) {
      await tx.rebatePayment.create({ data: { payableId: calculation.payable.id, bankAccountId: settlement.bankAccountId, journalEntryId: journal.id, paymentDate: settlementDate, paymentMethod: settlement.methodCode, reference: input.reference ?? null, amount } });
      const paid = calculation.payable.paidAmount.plus(amount);
      await tx.rebatePayable.update({ where: { id: calculation.payable.id }, data: { paidAmount: paid, outstandingAmount: calculation.payable.accruedAmount.minus(paid) } });
    }

    const settledAmount = calculation.settledAmount.plus(amount);
    const outstandingAmount = calculation.approvedAmount.minus(settledAmount);
    const status = outstandingAmount.isZero() ? RebateStatus.SETTLED : RebateStatus.PARTIALLY_SETTLED;

    // Update item-level settled amounts in calculationDetails if present
    const details = (calculation.calculationDetails as Record<string, any>) || {};
    if (Array.isArray(details.items)) {
      if (input.itemAllocations && input.itemAllocations.length > 0) {
        const allocMap = new Map(input.itemAllocations.map((a) => [a.variantId, a.allocatedAmount]));
        details.items = details.items.map((item: any) => {
          const alloc = allocMap.get(item.variantId) || 0;
          const currentSettled = Number(item.settledAmount || 0) + alloc;
          const remaining = Math.max(0, Number(item.approvedAmount || item.claimAmount) - currentSettled);
          return {
            ...item,
            settledAmount: currentSettled,
            outstandingAmount: remaining,
            status: remaining === 0 ? "SETTLED" : "PARTIALLY_SETTLED",
          };
        });
      } else {
        // Proportionally allocate across items
        const ratio = amount.div(calculation.approvedAmount).toNumber();
        details.items = details.items.map((item: any) => {
          const itemPortion = (Number(item.approvedAmount || item.claimAmount) * ratio);
          const currentSettled = Number(item.settledAmount || 0) + itemPortion;
          const remaining = Math.max(0, Number(item.approvedAmount || item.claimAmount) - currentSettled);
          return {
            ...item,
            settledAmount: currentSettled,
            outstandingAmount: remaining,
            status: remaining <= 0.01 ? "SETTLED" : "PARTIALLY_SETTLED",
          };
        });
      }
    }

    const updated = await tx.rebateCalculation.update({
      where: { id },
      data: { settledAmount, outstandingAmount, status, calculationDetails: details },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId, action: receivable ? "REBATE_RECEIVED" : "REBATE_PAID", module: "finance", entityType: "RebateCalculation", entityId: id, entityReference: calculation.referenceNumber, newValues: { amount: amount.toFixed(4), outstanding: outstandingAmount.toFixed(4), method: settlement.methodCode, journal: journal.voucherNumber } }, tx);
    return { calculation: updated, journal };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}
