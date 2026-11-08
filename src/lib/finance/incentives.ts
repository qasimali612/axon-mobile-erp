import "server-only";

import { IncentiveRecipientType, IncentiveStatus, Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { decimal, zero } from "@/lib/finance/money";
import { postSystemJournal } from "@/lib/finance/system-journal";
import { resolveSettlement } from "@/lib/finance/settlement";
import { assertMakerChecker } from "@/lib/operating-mode";
import { prisma } from "@/lib/prisma";

export type IncentiveActor = { companyId: string; userId: string; currencyCode: string };

export type PlanInput = {
  code: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string;
  recipientType: "USER" | "CUSTOMER" | "BRANCH";
  branchId?: string | null;
  incentiveType: "PERCENT_NET_SALES" | "SALES_TARGET" | "BRANCH_TARGET" | "FIXED_PER_UNIT";
  rate?: string | null;
  fixedAmount?: string | null;
  minimumTarget: string;
  maximumIncentive?: string | null;
  returnAdjustmentRule: "REVERSE" | "IGNORE";
  approvalRequired: boolean;
  expenseAccountId: string;
  payableAccountId: string;
  isActive: boolean;
};

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

type Bucket = {
  key: string;
  branchId: string;
  recipientType: IncentiveRecipientType;
  recipientUserId: string | null;
  recipientCustomerId: string | null;
  recipientName: string;
  netSales: Prisma.Decimal;
  quantity: Prisma.Decimal;
};

async function assertAccounts(tx: Prisma.TransactionClient, companyId: string, entries: { id: string; label: string; classes: string[] }[]) {
  const ids = entries.map((entry) => entry.id);
  const accounts = await tx.account.findMany({ where: { id: { in: ids }, companyId, isActive: true }, select: { id: true, code: true, name: true, accountClass: true } });
  for (const entry of entries) {
    const account = accounts.find((candidate) => candidate.id === entry.id);
    if (!account) throw new ApiError(422, "INVALID_ACCOUNT", `${entry.label} must be an active account in this company.`);
    if (!entry.classes.includes(account.accountClass)) {
      throw new ApiError(422, "INVALID_ACCOUNT_CLASS", `${entry.label} (${account.code} ${account.name}) must be a ${entry.classes.join(" or ").toLowerCase()} account.`);
    }
  }
  return accounts;
}

/* ------------------------------------------------------------------ plans */

export async function saveIncentivePlan(actor: IncentiveActor, input: PlanInput, id?: string) {
  await assertAccounts(prisma, actor.companyId, [
    { id: input.expenseAccountId, label: "Incentive expense account", classes: ["EXPENSE"] },
    { id: input.payableAccountId, label: "Incentive payable account", classes: ["LIABILITY"] },
  ]);
  if (input.branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: input.branchId, companyId: actor.companyId, isActive: true }, select: { id: true } });
    if (!branch) throw new ApiError(422, "INVALID_BRANCH", "Select an active branch in this company.");
  }
  const data = {
    name: input.name,
    effectiveFrom: toDate(input.effectiveFrom),
    effectiveTo: toDate(input.effectiveTo),
    recipientType: input.recipientType as IncentiveRecipientType,
    branchId: input.branchId ?? null,
    incentiveType: input.incentiveType,
    rate: input.rate ? decimal(input.rate) : null,
    fixedAmount: input.fixedAmount ? decimal(input.fixedAmount) : null,
    minimumTarget: decimal(input.minimumTarget || "0"),
    maximumIncentive: input.maximumIncentive ? decimal(input.maximumIncentive) : null,
    returnAdjustmentRule: input.returnAdjustmentRule,
    approvalRequired: input.approvalRequired,
    expenseAccountId: input.expenseAccountId,
    payableAccountId: input.payableAccountId,
    isActive: input.isActive,
  };
  if (id) {
    const existing = await prisma.incentivePlan.findFirst({ where: { id, companyId: actor.companyId } });
    if (!existing) throw new ApiError(404, "INCENTIVE_PLAN_NOT_FOUND", "Incentive plan was not found.");
    if (input.code !== existing.code) throw new ApiError(422, "PLAN_CODE_IMMUTABLE", "The plan code cannot be changed after creation.");
    const updated = await prisma.incentivePlan.update({ where: { id }, data });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, action: "INCENTIVE_PLAN_UPDATED", module: "finance", entityType: "IncentivePlan", entityId: id, entityReference: existing.code, previousValues: { rate: existing.rate?.toString() ?? null, fixedAmount: existing.fixedAmount?.toString() ?? null, isActive: existing.isActive }, newValues: { rate: data.rate?.toString() ?? null, fixedAmount: data.fixedAmount?.toString() ?? null, isActive: data.isActive } });
    return updated;
  }
  const created = await prisma.incentivePlan.create({ data: { ...data, code: input.code, companyId: actor.companyId } });
  await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: created.branchId, action: "INCENTIVE_PLAN_CREATED", module: "finance", entityType: "IncentivePlan", entityId: created.id, entityReference: created.code, newValues: { recipientType: created.recipientType, incentiveType: created.incentiveType, rate: created.rate?.toString() ?? null, fixedAmount: created.fixedAmount?.toString() ?? null } });
  return created;
}

/* ----------------------------------------------------------- calculations */

async function collectBuckets(tx: Prisma.TransactionClient, plan: { companyId: string; branchId: string | null; recipientType: IncentiveRecipientType; returnAdjustmentRule: string }, periodStart: Date, periodEnd: Date) {
  const scope = plan.branchId ? { branchId: plan.branchId } : {};
  const invoices = await tx.salesInvoice.findMany({
    where: { companyId: plan.companyId, status: "POSTED", invoiceDate: { gte: periodStart, lte: periodEnd }, ...scope },
    select: {
      id: true, branchId: true, customerId: true, salespersonId: true, subtotal: true, discountTotal: true,
      customer: { select: { name: true } }, salesperson: { select: { fullName: true } }, branch: { select: { code: true, name: true } },
    },
    take: 20_000,
  });
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const quantityRows = invoiceIds.length
    ? await tx.salesInvoiceLine.groupBy({ by: ["invoiceId"], where: { invoiceId: { in: invoiceIds } }, _sum: { quantity: true } })
    : [];
  const quantityByInvoice = new Map(quantityRows.map((row) => [row.invoiceId, row._sum.quantity ?? zero()]));
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));

  const buckets = new Map<string, Bucket>();
  const push = (input: { branchId: string; branchName: string; salespersonId: string | null; salespersonName: string | null; customerId: string; customerName: string }, netSales: Prisma.Decimal, quantity: Prisma.Decimal) => {
    let recipientUserId: string | null = null;
    let recipientCustomerId: string | null = null;
    let recipientName = "";
    if (plan.recipientType === IncentiveRecipientType.USER) {
      if (!input.salespersonId) return;
      recipientUserId = input.salespersonId;
      recipientName = input.salespersonName ?? "Salesperson";
    } else if (plan.recipientType === IncentiveRecipientType.CUSTOMER) {
      recipientCustomerId = input.customerId;
      recipientName = input.customerName;
    } else {
      recipientName = input.branchName;
    }
    const key = `${recipientUserId ?? recipientCustomerId ?? "BRANCH"}:${input.branchId}`;
    const bucket = buckets.get(key) ?? {
      key,
      branchId: input.branchId,
      recipientType: plan.recipientType,
      recipientUserId,
      recipientCustomerId,
      recipientName,
      netSales: zero(),
      quantity: zero(),
    };
    bucket.netSales = bucket.netSales.plus(netSales);
    bucket.quantity = bucket.quantity.plus(quantity);
    buckets.set(key, bucket);
  };

  for (const invoice of invoices) {
    const net = invoice.subtotal.minus(invoice.discountTotal);
    if (net.lte(0)) continue;
    push(
      { branchId: invoice.branchId, branchName: `${invoice.branch.code} · ${invoice.branch.name}`, salespersonId: invoice.salespersonId, salespersonName: invoice.salesperson?.fullName ?? null, customerId: invoice.customerId, customerName: invoice.customer.name },
      net,
      quantityByInvoice.get(invoice.id) ?? zero(),
    );
  }

  if (plan.returnAdjustmentRule === "REVERSE") {
    const returns = await tx.stockReturn.findMany({
      where: { companyId: plan.companyId, status: "POSTED", returnType: "SALES_RETURN", returnDate: { gte: periodStart, lte: periodEnd }, ...scope },
      select: { id: true, branchId: true, customerId: true, salesInvoiceId: true, subtotal: true, discountTotal: true, lines: { select: { quantity: true } }, customer: { select: { name: true } }, branch: { select: { code: true, name: true } } },
      take: 20_000,
    });
    if (returns.length) {
      const referencedIds = [...new Set(returns.map((row) => row.salesInvoiceId).filter((value): value is string => Boolean(value) && !invoiceById.has(value!)))];
      const referenced = referencedIds.length
        ? await tx.salesInvoice.findMany({ where: { id: { in: referencedIds }, companyId: plan.companyId }, select: { id: true, branchId: true, customerId: true, salespersonId: true, customer: { select: { name: true } }, salesperson: { select: { fullName: true } }, branch: { select: { code: true, name: true } } } })
        : [];
      const referencedById = new Map(referenced.map((invoice) => [invoice.id, invoice]));
      for (const row of returns) {
        const source = row.salesInvoiceId ? invoiceById.get(row.salesInvoiceId) ?? referencedById.get(row.salesInvoiceId) : undefined;
        const branchId = row.branchId ?? source?.branchId;
        if (!branchId) continue;
        const quantity = row.lines.reduce((sum, line) => sum.plus(line.quantity), zero());
        push(
          {
            branchId,
            branchName: `${row.branch.code} · ${row.branch.name}`,
            salespersonId: source?.salespersonId ?? null,
            salespersonName: source?.salesperson?.fullName ?? null,
            customerId: row.customerId ?? source?.customerId ?? "",
            customerName: row.customer?.name ?? source?.customer?.name ?? "Customer",
          },
          row.subtotal.minus(row.discountTotal).negated(),
          quantity.negated(),
        );
      }
    }
  }

  return [...buckets.values()].filter((bucket) => bucket.netSales.gt(0) || bucket.quantity.gt(0));
}

function evaluate(plan: { incentiveType: string; rate: Prisma.Decimal | null; fixedAmount: Prisma.Decimal | null; minimumTarget: Prisma.Decimal; maximumIncentive: Prisma.Decimal | null }, bucket: Bucket) {
  const netSales = bucket.netSales;
  const quantity = bucket.quantity;
  let amount = zero();
  let eligible = true;
  let reason: string | null = null;
  if (plan.incentiveType === "FIXED_PER_UNIT") {
    if (quantity.lt(plan.minimumTarget)) {
      eligible = false;
      reason = "BELOW_MINIMUM_QUANTITY";
    } else {
      amount = (plan.fixedAmount ?? zero()).mul(quantity);
    }
  } else if (plan.incentiveType === "SALES_TARGET" || plan.incentiveType === "BRANCH_TARGET") {
    if (netSales.lte(plan.minimumTarget)) {
      eligible = false;
      reason = "BELOW_MINIMUM_TARGET";
    } else {
      amount = netSales.minus(plan.minimumTarget).mul(plan.rate ?? zero()).div(100);
    }
  } else {
    if (netSales.lt(plan.minimumTarget)) {
      eligible = false;
      reason = "BELOW_MINIMUM_TARGET";
    } else {
      amount = netSales.mul(plan.rate ?? zero()).div(100);
    }
  }
  let capped = false;
  if (eligible && plan.maximumIncentive && amount.gt(plan.maximumIncentive)) {
    amount = plan.maximumIncentive;
    capped = true;
  }
  const calculatedAmount = amount.toDecimalPlaces(4);
  return {
    calculatedAmount,
    details: {
      incentiveType: plan.incentiveType,
      rate: plan.rate?.toString() ?? null,
      fixedAmount: plan.fixedAmount?.toString() ?? null,
      minimumTarget: plan.minimumTarget.toString(),
      netSales: netSales.toDecimalPlaces(4).toString(),
      quantity: quantity.toDecimalPlaces(4).toString(),
      eligible,
      ineligibilityReason: reason,
      capped,
    } satisfies Prisma.InputJsonValue,
  };
}

export async function calculateIncentives(actor: IncentiveActor, planId: string, input: { periodStart: string; periodEnd: string; branchId?: string | null }) {
  const periodStart = toDate(input.periodStart);
  const periodEnd = toDate(input.periodEnd);
  const plan = await prisma.incentivePlan.findFirst({ where: { id: planId, companyId: actor.companyId } });
  if (!plan) throw new ApiError(404, "INCENTIVE_PLAN_NOT_FOUND", "Incentive plan was not found.");
  if (!plan.isActive) throw new ApiError(409, "PLAN_INACTIVE", "An inactive incentive plan cannot be calculated.");
  if (periodStart < plan.effectiveFrom || periodEnd > plan.effectiveTo) {
    throw new ApiError(422, "PERIOD_OUTSIDE_PLAN", `The calculation period must fall inside the plan's effective dates (${isoDate(plan.effectiveFrom)} → ${isoDate(plan.effectiveTo)}).`);
  }
  if (input.branchId && plan.branchId && input.branchId !== plan.branchId) {
    throw new ApiError(422, "BRANCH_SCOPE_MISMATCH", "The requested branch is outside this plan's scope.");
  }

  return prisma.$transaction(async (tx) => {
    const buckets = await collectBuckets(tx, plan, periodStart, periodEnd);
    const existing = await tx.incentiveCalculation.findMany({
      where: { planId: plan.id, periodStart, periodEnd },
      select: { recipientType: true, recipientUserId: true, recipientCustomerId: true, branchId: true },
    });
    const taken = new Set(existing.map((row) => `${row.recipientUserId ?? row.recipientCustomerId ?? "BRANCH"}:${row.branchId}`));
    const created = [];
    let skipped = 0;
    for (const bucket of buckets) {
      if (taken.has(bucket.key)) {
        skipped += 1;
        continue;
      }
      const { calculatedAmount, details } = evaluate(plan, bucket);
      const row = await tx.incentiveCalculation.create({
        data: {
          companyId: actor.companyId,
          planId: plan.id,
          branchId: bucket.branchId,
          recipientType: bucket.recipientType,
          recipientUserId: bucket.recipientUserId,
          recipientCustomerId: bucket.recipientCustomerId,
          recipientName: bucket.recipientName.slice(0, 160),
          periodStart,
          periodEnd,
          eligibleQuantity: bucket.quantity.toDecimalPlaces(4),
          eligibleNetSales: bucket.netSales.toDecimalPlaces(4),
          calculatedAmount,
          adjustmentAmount: zero(),
          approvedAmount: zero(),
          status: IncentiveStatus.CALCULATED,
          calculationDetails: details,
          calculatedById: actor.userId,
        },
      });
      created.push(row);
      await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: bucket.branchId, action: "INCENTIVE_CALCULATED", module: "finance", entityType: "IncentiveCalculation", entityId: row.id, entityReference: plan.code, newValues: { recipient: row.recipientName, netSales: bucket.netSales.toDecimalPlaces(4).toString(), quantity: bucket.quantity.toDecimalPlaces(4).toString(), calculatedAmount: calculatedAmount.toFixed(4) } }, tx);
    }
    return { created: created.length, skipped, rows: created };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
}

export async function adjustIncentive(actor: IncentiveActor, id: string, input: { adjustmentAmount: string; reason: string }) {
  return prisma.$transaction(async (tx) => {
    const calculation = await tx.incentiveCalculation.findFirst({ where: { id, companyId: actor.companyId }, include: { plan: { select: { code: true } } } });
    if (!calculation) throw new ApiError(404, "INCENTIVE_CALCULATION_NOT_FOUND", "Incentive calculation was not found.");
    if (calculation.status !== IncentiveStatus.CALCULATED) throw new ApiError(409, "INVALID_INCENTIVE_STATE", "Only a calculated incentive can be adjusted before approval.");
    const adjustment = decimal(input.adjustmentAmount);
    if (calculation.calculatedAmount.plus(adjustment).lt(0)) throw new ApiError(422, "INVALID_ADJUSTMENT", "The adjustment cannot make the payable amount negative.");
    const updated = await tx.incentiveCalculation.update({ where: { id }, data: { adjustmentAmount: adjustment, approvedAmount: calculation.calculatedAmount.plus(adjustment) } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: calculation.branchId, action: "INCENTIVE_ADJUSTED", module: "finance", entityType: "IncentiveCalculation", entityId: id, entityReference: calculation.plan.code, reason: input.reason, previousValues: { adjustmentAmount: calculation.adjustmentAmount.toFixed(4) }, newValues: { adjustmentAmount: adjustment.toFixed(4) } }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

export async function approveIncentive(actor: IncentiveActor, id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "IncentiveCalculation" WHERE "id" = ${id}::uuid AND "companyId" = ${actor.companyId}::uuid FOR UPDATE`);
    const calculation = await tx.incentiveCalculation.findFirst({ where: { id, companyId: actor.companyId }, include: { plan: { select: { code: true } } } });
    if (!calculation) throw new ApiError(404, "INCENTIVE_CALCULATION_NOT_FOUND", "Incentive calculation was not found.");
    const approvable: IncentiveStatus[] = [IncentiveStatus.CALCULATED, IncentiveStatus.SUBMITTED];
    if (!approvable.includes(calculation.status)) throw new ApiError(409, "INVALID_INCENTIVE_STATE", "Only a calculated incentive can be approved.");
    await assertMakerChecker(tx, actor.companyId, calculation.calculatedById, actor.userId, "approve this incentive");
    const approvedAmount = calculation.calculatedAmount.plus(calculation.adjustmentAmount);
    if (approvedAmount.lte(0)) throw new ApiError(422, "INVALID_APPROVED_AMOUNT", "The approved incentive amount must be above zero.");
    const updated = await tx.incentiveCalculation.update({ where: { id }, data: { status: IncentiveStatus.APPROVED, approvedAmount, approvedById: actor.userId, approvedAt: new Date() } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: calculation.branchId, action: "INCENTIVE_APPROVED", module: "finance", entityType: "IncentiveCalculation", entityId: id, entityReference: calculation.plan.code, newValues: { approvedAmount: approvedAmount.toFixed(4), recipient: calculation.recipientName } }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

export async function accrueIncentive(actor: IncentiveActor, id: string, input: { postingDate?: string }) {
  const postingDate = input.postingDate ? toDate(input.postingDate) : new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "IncentiveCalculation" WHERE "id" = ${id}::uuid AND "companyId" = ${actor.companyId}::uuid FOR UPDATE`);
    const calculation = await tx.incentiveCalculation.findFirst({ where: { id, companyId: actor.companyId }, include: { plan: true, payable: true } });
    if (!calculation) throw new ApiError(404, "INCENTIVE_CALCULATION_NOT_FOUND", "Incentive calculation was not found.");
    if (calculation.status !== IncentiveStatus.APPROVED) throw new ApiError(409, "INVALID_INCENTIVE_STATE", "Only an approved incentive can be accrued.");
    if (calculation.payable) throw new ApiError(409, "INCENTIVE_ALREADY_ACCRUED", "This incentive already has a payable record.");
    if (!calculation.branchId) throw new ApiError(409, "BRANCH_REQUIRED", "The incentive needs a branch before it can be accrued.");
    const approvedAmount = calculation.approvedAmount;
    if (approvedAmount.lte(0)) throw new ApiError(422, "INVALID_APPROVED_AMOUNT", "The approved incentive amount must be above zero.");
    const reference = `${calculation.plan.code}/${isoDate(calculation.periodEnd)}`.slice(0, 60);

    const journal = await postSystemJournal(tx, {
      actor,
      preparedById: calculation.calculatedById ?? "",
      branchId: calculation.branchId,
      postingDate,
      sourceModule: "INCENTIVE",
      sourceDocumentType: "INCENTIVE_ACCRUAL",
      sourceDocumentId: calculation.id,
      sourceDocumentNumber: reference,
      narration: `Incentive accrual · ${calculation.plan.code} · ${calculation.recipientName ?? ""}`.trim(),
      reference,
      documentTypePrefix: "INCENTIVE",
      numberSuffix: "INC",
      lines: [
        { accountId: calculation.plan.expenseAccountId, description: `Incentive expense ${reference}`, debit: approvedAmount.toFixed(4) },
        { accountId: calculation.plan.payableAccountId, description: `Incentive payable ${reference}`, credit: approvedAmount.toFixed(4) },
      ],
    });

    const payable = await tx.incentivePayable.create({
      data: {
        companyId: actor.companyId,
        calculationId: calculation.id,
        voucherNumber: journal.voucherNumber,
        accruedAmount: approvedAmount,
        paidAmount: zero(),
        outstandingAmount: approvedAmount,
        status: IncentiveStatus.ACCRUED,
        accrualJournalId: journal.id,
      },
    });
    const updated = await tx.incentiveCalculation.update({ where: { id }, data: { status: IncentiveStatus.ACCRUED, accrualJournalId: journal.id } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: calculation.branchId, action: "INCENTIVE_ACCRUED", module: "finance", entityType: "IncentiveCalculation", entityId: id, entityReference: reference, newValues: { journal: journal.voucherNumber, approvedAmount: approvedAmount.toFixed(4) } }, tx);
    return { calculation: updated, payable, journal };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

export async function payIncentive(actor: IncentiveActor, payableId: string, input: { amount: string; paymentDate: string; paymentMethodId: string; bankAccountId?: string | null; reference?: string | null }) {
  const paymentDate = toDate(input.paymentDate);
  const amount = decimal(input.amount);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "IncentivePayable" WHERE "id" = ${payableId}::uuid AND "companyId" = ${actor.companyId}::uuid FOR UPDATE`);
    const payable = await tx.incentivePayable.findFirst({ where: { id: payableId, companyId: actor.companyId }, include: { calculation: { include: { plan: true } } } });
    if (!payable) throw new ApiError(404, "INCENTIVE_PAYABLE_NOT_FOUND", "Incentive payable was not found.");
    const payableStates: IncentiveStatus[] = [IncentiveStatus.ACCRUED, IncentiveStatus.PARTIALLY_PAID];
    if (!payableStates.includes(payable.status)) throw new ApiError(409, "INVALID_INCENTIVE_STATE", "Only an accrued incentive can be paid.");
    if (amount.lte(0)) throw new ApiError(422, "INVALID_PAYMENT_AMOUNT", "The payment amount must be above zero.");
    if (amount.gt(payable.outstandingAmount)) throw new ApiError(422, "PAYMENT_EXCEEDS_OUTSTANDING", `The payment exceeds the outstanding balance of ${payable.outstandingAmount.toFixed(4)}.`);
    if (!payable.calculation.branchId) throw new ApiError(409, "BRANCH_REQUIRED", "The incentive payable has no branch.");
    const settlement = await resolveSettlement(tx, actor, input);
    const paymentId = crypto.randomUUID();

    const journal = await postSystemJournal(tx, {
      actor,
      preparedById: payable.calculation.approvedById ?? "",
      branchId: payable.calculation.branchId,
      postingDate: paymentDate,
      sourceModule: "INCENTIVE",
      sourceDocumentType: "INCENTIVE_PAYMENT",
      sourceDocumentId: paymentId,
      sourceDocumentNumber: payable.voucherNumber,
      narration: `Incentive payment · ${payable.calculation.plan.code} · ${payable.calculation.recipientName ?? ""}`.trim(),
      reference: payable.voucherNumber,
      documentTypePrefix: "INCENTIVE",
      numberSuffix: "INCP",
      lines: [
        { accountId: payable.calculation.plan.payableAccountId, description: `Incentive payable settled ${payable.voucherNumber}`, debit: amount.toFixed(4) },
        { accountId: settlement.glAccountId, description: `Incentive paid via ${settlement.methodName}`, credit: amount.toFixed(4) },
      ],
    });

    const payment = await tx.incentivePayment.create({
      data: { payableId: payable.id, bankAccountId: settlement.bankAccountId, journalEntryId: journal.id, paymentDate, paymentMethod: settlement.methodCode, reference: input.reference ?? null, amount },
    });
    const paidAmount = payable.paidAmount.plus(amount);
    const outstandingAmount = payable.accruedAmount.minus(paidAmount);
    const status = outstandingAmount.isZero() ? IncentiveStatus.PAID : IncentiveStatus.PARTIALLY_PAID;
    const updatedPayable = await tx.incentivePayable.update({ where: { id: payable.id }, data: { paidAmount, outstandingAmount, status } });
    await tx.incentiveCalculation.update({ where: { id: payable.calculationId }, data: { status } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: payable.calculation.branchId, action: "INCENTIVE_PAID", module: "finance", entityType: "IncentivePayable", entityId: payable.id, entityReference: payable.voucherNumber, newValues: { amount: amount.toFixed(4), outstanding: outstandingAmount.toFixed(4), method: settlement.methodCode, journal: journal.voucherNumber } }, tx);
    return { payable: updatedPayable, payment, journal };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

export async function reverseIncentiveAccrual(actor: IncentiveActor, id: string, input: { reason: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "IncentiveCalculation" WHERE "id" = ${id}::uuid AND "companyId" = ${actor.companyId}::uuid FOR UPDATE`);
    const calculation = await tx.incentiveCalculation.findFirst({ where: { id, companyId: actor.companyId }, include: { plan: true, payable: { include: { payments: true } } } });
    if (!calculation) throw new ApiError(404, "INCENTIVE_CALCULATION_NOT_FOUND", "Incentive calculation was not found.");
    if (calculation.status !== IncentiveStatus.ACCRUED || !calculation.payable) throw new ApiError(409, "INVALID_INCENTIVE_STATE", "Only an accrued incentive without settlements can be reversed.");
    if (calculation.payable.payments.length) throw new ApiError(409, "INCENTIVE_HAS_PAYMENTS", "This incentive already has payments and cannot be reversed.");
    if (!calculation.branchId) throw new ApiError(409, "BRANCH_REQUIRED", "The incentive has no branch and cannot be reversed.");
    const postingDate = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

    const journal = await postSystemJournal(tx, {
      actor,
      preparedById: calculation.approvedById ?? calculation.calculatedById ?? "",
      branchId: calculation.branchId,
      postingDate,
      sourceModule: "INCENTIVE",
      sourceDocumentType: "INCENTIVE_ACCRUAL_REVERSAL",
      sourceDocumentId: calculation.id,
      sourceDocumentNumber: calculation.payable.voucherNumber,
      narration: `Incentive accrual reversal · ${calculation.plan.code} · ${input.reason}`,
      reference: calculation.payable.voucherNumber,
      documentTypePrefix: "INCENTIVE",
      numberSuffix: "INCR",
      lines: [
        { accountId: calculation.plan.payableAccountId, description: `Incentive payable reversed ${calculation.payable.voucherNumber}`, debit: calculation.approvedAmount.toFixed(4) },
        { accountId: calculation.plan.expenseAccountId, description: `Incentive expense reversed ${calculation.payable.voucherNumber}`, credit: calculation.approvedAmount.toFixed(4) },
      ],
    });

    await tx.incentivePayable.update({ where: { id: calculation.payable.id }, data: { status: IncentiveStatus.REVERSED, outstandingAmount: zero() } });
    const updated = await tx.incentiveCalculation.update({ where: { id }, data: { status: IncentiveStatus.REVERSED } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: calculation.branchId, action: "INCENTIVE_REVERSED", module: "finance", entityType: "IncentiveCalculation", entityId: id, entityReference: calculation.payable.voucherNumber, reason: input.reason, newValues: { journal: journal.voucherNumber, amount: calculation.approvedAmount.toFixed(4) } }, tx);
    return { calculation: updated, journal };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

/* ------------------------------------------------- supplier incentives in */

export type ReceivedIncentiveInput = {
  referenceNumber: string;
  payerName: string;
  programName: string;
  supplierId?: string | null;
  planId?: string | null;
  periodStart: string;
  periodEnd: string;
  targetQuantity: string;
  achievedQuantity: string;
  eligibleAmount: string;
  expectedReceiptDate?: string | null;
  incomeAccountId: string;
  receivableAccountId: string;
};

export async function createReceivedIncentive(actor: IncentiveActor, input: ReceivedIncentiveInput) {
  const existing = await prisma.receivedIncentive.findUnique({ where: { companyId_referenceNumber: { companyId: actor.companyId, referenceNumber: input.referenceNumber } }, select: { id: true } });
  if (existing) throw new ApiError(409, "DUPLICATE_RECEIVED_INCENTIVE", "A supplier incentive claim with this reference already exists.");
  await assertAccounts(prisma, actor.companyId, [
    { id: input.incomeAccountId, label: "Incentive income account", classes: ["REVENUE"] },
    { id: input.receivableAccountId, label: "Incentive receivable account", classes: ["ASSET"] },
  ]);
  if (input.supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, companyId: actor.companyId, status: "ACTIVE" }, select: { id: true } });
    if (!supplier) throw new ApiError(422, "INVALID_SUPPLIER", "Select an active supplier in this company.");
  }
  if (input.planId) {
    const plan = await prisma.incentivePlan.findFirst({ where: { id: input.planId, companyId: actor.companyId }, select: { id: true } });
    if (!plan) throw new ApiError(422, "INVALID_INCENTIVE_PLAN", "The selected incentive plan was not found.");
  }
  const created = await prisma.receivedIncentive.create({
    data: {
      companyId: actor.companyId,
      planId: input.planId ?? null,
      supplierId: input.supplierId ?? null,
      referenceNumber: input.referenceNumber,
      payerName: input.payerName,
      programName: input.programName,
      periodStart: toDate(input.periodStart),
      periodEnd: toDate(input.periodEnd),
      targetQuantity: decimal(input.targetQuantity || "0"),
      achievedQuantity: decimal(input.achievedQuantity || "0"),
      eligibleAmount: decimal(input.eligibleAmount),
      approvedAmount: zero(),
      receivedAmount: zero(),
      outstandingAmount: zero(),
      expectedReceiptDate: input.expectedReceiptDate ? toDate(input.expectedReceiptDate) : null,
      status: IncentiveStatus.DRAFT,
      incomeAccountId: input.incomeAccountId,
      receivableAccountId: input.receivableAccountId,
      preparedById: actor.userId,
    },
  });
  await appendAudit({ companyId: actor.companyId, actorId: actor.userId, action: "RECEIVED_INCENTIVE_CREATED", module: "finance", entityType: "ReceivedIncentive", entityId: created.id, entityReference: created.referenceNumber, newValues: { eligibleAmount: created.eligibleAmount.toFixed(4), payer: created.payerName } });
  return created;
}

export async function approveReceivedIncentive(actor: IncentiveActor, id: string, input: { postingDate?: string; branchId?: string }) {
  const postingDate = input.postingDate ? toDate(input.postingDate) : new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ReceivedIncentive" WHERE "id" = ${id}::uuid AND "companyId" = ${actor.companyId}::uuid FOR UPDATE`);
    const claim = await tx.receivedIncentive.findFirst({ where: { id, companyId: actor.companyId }, include: { accrualJournal: true } });
    if (!claim) throw new ApiError(404, "RECEIVED_INCENTIVE_NOT_FOUND", "Supplier incentive claim was not found.");
    if (claim.status !== IncentiveStatus.DRAFT && claim.status !== IncentiveStatus.SUBMITTED) throw new ApiError(409, "INVALID_INCENTIVE_STATE", "Only a draft supplier incentive claim can be approved.");
    if (!claim.preparedById) throw new ApiError(409, "CLAIM_PREPARER_REQUIRED", "This claim has no recorded preparer and cannot be approved.");
    const branch = await tx.branch.findFirst({ where: { id: input.branchId ?? "", companyId: actor.companyId, isActive: true }, select: { id: true } });
    if (!branch) throw new ApiError(422, "INVALID_BRANCH", "Select the branch that owns this claim.");

    const journal = await postSystemJournal(tx, {
      actor,
      preparedById: claim.preparedById,
      branchId: branch.id,
      postingDate,
      sourceModule: "INCENTIVE",
      sourceDocumentType: "RECEIVED_INCENTIVE_ACCRUAL",
      sourceDocumentId: claim.id,
      sourceDocumentNumber: claim.referenceNumber,
      narration: `Supplier incentive accrued · ${claim.programName} · ${claim.payerName}`,
      reference: claim.referenceNumber,
      documentTypePrefix: "INCENTIVE",
      numberSuffix: "RIC",
      lines: [
        { accountId: claim.receivableAccountId, description: `Supplier incentive receivable ${claim.referenceNumber}`, debit: claim.eligibleAmount.toFixed(4) },
        { accountId: claim.incomeAccountId, description: `Supplier incentive income ${claim.referenceNumber}`, credit: claim.eligibleAmount.toFixed(4) },
      ],
    });

    const updated = await tx.receivedIncentive.update({
      where: { id: claim.id },
      data: { status: IncentiveStatus.ACCRUED, approvedAmount: claim.eligibleAmount, outstandingAmount: claim.eligibleAmount, approvedById: actor.userId, approvedAt: new Date(), accrualJournalId: journal.id },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: branch.id, action: "RECEIVED_INCENTIVE_APPROVED", module: "finance", entityType: "ReceivedIncentive", entityId: claim.id, entityReference: claim.referenceNumber, newValues: { approvedAmount: claim.eligibleAmount.toFixed(4), journal: journal.voucherNumber } }, tx);
    return { claim: updated, journal };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

export async function receiveIncentive(actor: IncentiveActor, id: string, input: { amount: string; receiptDate: string; paymentMethodId: string; bankAccountId?: string | null; reference?: string | null }) {
  const receiptDate = toDate(input.receiptDate);
  const amount = decimal(input.amount);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ReceivedIncentive" WHERE "id" = ${id}::uuid AND "companyId" = ${actor.companyId}::uuid FOR UPDATE`);
    const claim = await tx.receivedIncentive.findFirst({ where: { id, companyId: actor.companyId } });
    if (!claim) throw new ApiError(404, "RECEIVED_INCENTIVE_NOT_FOUND", "Supplier incentive claim was not found.");
    const receivableStates: IncentiveStatus[] = [IncentiveStatus.ACCRUED, IncentiveStatus.PARTIALLY_RECEIVED];
    if (!receivableStates.includes(claim.status)) throw new ApiError(409, "INVALID_INCENTIVE_STATE", "Only an accrued supplier incentive can be received.");
    if (amount.lte(0)) throw new ApiError(422, "INVALID_PAYMENT_AMOUNT", "The receipt amount must be above zero.");
    if (amount.gt(claim.outstandingAmount)) throw new ApiError(422, "PAYMENT_EXCEEDS_OUTSTANDING", `The receipt exceeds the outstanding balance of ${claim.outstandingAmount.toFixed(4)}.`);
    const settlement = await resolveSettlement(tx, actor, input);
    const paymentId = crypto.randomUUID();
    const branchId = settlement.branchId ?? (await tx.branch.findFirst({ where: { companyId: actor.companyId, isActive: true }, select: { id: true }, orderBy: { code: "asc" } }))?.id;
    if (!branchId) throw new ApiError(409, "BRANCH_REQUIRED", "No active branch is available for the receipt.");

    const journal = await postSystemJournal(tx, {
      actor,
      preparedById: claim.approvedById ?? claim.preparedById ?? "",
      branchId,
      postingDate: receiptDate,
      sourceModule: "INCENTIVE",
      sourceDocumentType: "RECEIVED_INCENTIVE_PAYMENT",
      sourceDocumentId: paymentId,
      sourceDocumentNumber: claim.referenceNumber,
      narration: `Supplier incentive received · ${claim.programName} · ${claim.payerName}`,
      reference: claim.referenceNumber,
      documentTypePrefix: "INCENTIVE",
      numberSuffix: "RIR",
      lines: [
        { accountId: settlement.glAccountId, description: `Supplier incentive received via ${settlement.methodName}`, debit: amount.toFixed(4) },
        { accountId: claim.receivableAccountId, description: `Supplier incentive receivable settled ${claim.referenceNumber}`, credit: amount.toFixed(4) },
      ],
    });

    await tx.receivedIncentivePayment.create({
      data: { receivedIncentiveId: claim.id, bankAccountId: settlement.bankAccountId, journalEntryId: journal.id, receiptDate, receiptMethod: settlement.methodCode, reference: input.reference ?? null, amount },
    });
    const receivedAmount = claim.receivedAmount.plus(amount);
    const outstandingAmount = claim.approvedAmount.minus(receivedAmount);
    const status = outstandingAmount.isZero() ? IncentiveStatus.RECEIVED : IncentiveStatus.PARTIALLY_RECEIVED;
    const updated = await tx.receivedIncentive.update({ where: { id: claim.id }, data: { receivedAmount, outstandingAmount, status } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId, action: "RECEIVED_INCENTIVE_RECEIVED", module: "finance", entityType: "ReceivedIncentive", entityId: claim.id, entityReference: claim.referenceNumber, newValues: { amount: amount.toFixed(4), outstanding: outstandingAmount.toFixed(4), method: settlement.methodCode, journal: journal.voucherNumber } }, tx);
    return { claim: updated, journal };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}
