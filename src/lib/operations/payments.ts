import "server-only";

import {
  OperationalDocumentStatus,
  PaymentDirection,
  Prisma,
} from "@prisma/client";
import type { z } from "zod";
import { ApiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { decimal, moneyString, zero } from "@/lib/finance/money";
import { ensureSingleUserDatabase, prisma } from "@/lib/prisma";
import {
  allocateOperationalNumber,
  postOperationalJournal,
  reverseOperationalJournal,
  requirePostingAccount,
  type OperationalActor,
} from "@/lib/operations/accounting";
import { parseOperationDate, paymentDraftSchema } from "@/lib/operations/validation";

export type PaymentDraftInput = z.infer<typeof paymentDraftSchema>;
type PaymentActor = OperationalActor;

async function lockPayment(tx: Prisma.TransactionClient, id: string, companyId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${id}::uuid AND "companyId" = ${companyId}::uuid FOR UPDATE`);
  return tx.payment.findFirst({
    where: { id, companyId },
    include: {
      customer: { select: { code: true, name: true, status: true } },
      supplier: { select: { code: true, name: true, status: true } },
      bankAccount: { select: { id: true, glAccountId: true, isActive: true, currencyCode: true, bankName: true } },
      cashAccount: { select: { id: true, accountType: true, isActive: true, currencyCode: true, name: true } },
      allocations: { include: { salesInvoice: true, purchaseReceipt: true } },
    },
  });
}

function paymentPartyKind(direction: PaymentDirection) {
  return direction === PaymentDirection.CUSTOMER_RECEIPT || direction === PaymentDirection.CUSTOMER_REFUND
    ? "customer"
    : "supplier";
}

export async function createPaymentDraft(actor: PaymentActor, input: PaymentDraftInput) {
  const paymentDate = parseOperationDate(input.paymentDate, "Payment date");
  const amount = decimal(input.amount);
  const allocations = input.allocations.map((allocation) => ({ ...allocation, amount: decimal(allocation.amount) }));
  const allocated = allocations.reduce((sum, allocation) => sum.plus(allocation.amount), zero());
  if (allocated.gt(amount)) throw new ApiError(422, "OVER_ALLOCATION", "Payment allocations exceed the payment amount.");
  const expectedParty = paymentPartyKind(input.direction);
  if (expectedParty === "customer" && (!input.customerId || input.supplierId)) throw new ApiError(422, "INVALID_PAYMENT_PARTY", "Customer receipts and refunds require one customer.");
  if (expectedParty === "supplier" && (!input.supplierId || input.customerId)) throw new ApiError(422, "INVALID_PAYMENT_PARTY", "Supplier payments and refunds require one supplier.");

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { companyId_idempotencyKey: { companyId: actor.companyId, idempotencyKey: input.idempotencyKey } },
        include: { allocations: true },
      });
      if (existing) return existing;
      let cashAccountId = input.cashAccountId || null;
      let bankAccountId = input.bankAccountId || null;
      let paymentMethodId: string | null = null;
      if (input.paymentMethodId) {
        const method = await tx.paymentMethod.findFirst({ where: { id: input.paymentMethodId, companyId: actor.companyId } });
        if (!method) throw new ApiError(404, "PAYMENT_METHOD_NOT_FOUND", "The selected payment method was not found.");
        if (!method.isActive) throw new ApiError(409, "PAYMENT_METHOD_INACTIVE", "The selected payment method is inactive.");
        if (method.requiresReference && !input.reference) throw new ApiError(422, "PAYMENT_REFERENCE_REQUIRED", `${method.name} requires a reference number.`);
        if (method.cashAccountId && cashAccountId && cashAccountId !== method.cashAccountId) throw new ApiError(422, "PAYMENT_METHOD_MISMATCH", `${method.name} settles into a different cash account.`);
        if (method.bankAccountId && bankAccountId && bankAccountId !== method.bankAccountId) throw new ApiError(422, "PAYMENT_METHOD_MISMATCH", `${method.name} settles into a different bank account.`);
        cashAccountId = method.cashAccountId ?? cashAccountId;
        bankAccountId = method.bankAccountId ?? bankAccountId;
        paymentMethodId = method.id;
      }
      if (Boolean(bankAccountId) === Boolean(cashAccountId)) throw new ApiError(422, "PAYMENT_SETTLEMENT_REQUIRED", "Choose a payment method or exactly one bank or cash account.");

      const party = expectedParty === "customer"
        ? await tx.customer.findFirst({ where: { id: input.customerId!, companyId: actor.companyId, status: "ACTIVE" } })
        : await tx.supplier.findFirst({ where: { id: input.supplierId!, companyId: actor.companyId, status: "ACTIVE" } });
      if (!party) throw new ApiError(404, "PARTY_NOT_FOUND", "The selected active payment party was not found.");
      if (bankAccountId) {
        const bank = await tx.bankAccount.findFirst({ where: { id: bankAccountId, companyId: actor.companyId, branchId: input.branchId, isActive: true } });
        if (!bank) throw new ApiError(404, "BANK_ACCOUNT_NOT_FOUND", "The selected active bank account was not found in this branch.");
        if (bank.currencyCode !== input.currencyCode) throw new ApiError(422, "CURRENCY_MISMATCH", "Payment and bank account currencies must match.");
      } else {
        const cash = await tx.account.findFirst({ where: { id: cashAccountId!, companyId: actor.companyId, accountType: "CASH", isActive: true, OR: [{ branchId: input.branchId }, { branchId: null }] } });
        if (!cash) throw new ApiError(404, "CASH_ACCOUNT_NOT_FOUND", "The selected active cash account was not found in this branch.");
        if (cash.currencyCode && cash.currencyCode !== input.currencyCode) throw new ApiError(422, "CURRENCY_MISMATCH", "Payment and cash account currencies must match.");
      }
      const { number } = await allocateOperationalNumber(tx, {
        companyId: actor.companyId,
        branchId: input.branchId,
        postingDate: paymentDate,
        documentType: "PAYMENT",
        suffix: input.direction === PaymentDirection.CUSTOMER_RECEIPT || input.direction === PaymentDirection.SUPPLIER_REFUND ? "RC" : "PV",
      });
      const payment = await tx.payment.create({
        data: {
          companyId: actor.companyId,
          branchId: input.branchId,
          customerId: input.customerId || null,
          supplierId: input.supplierId || null,
          bankAccountId,
          cashAccountId,
          paymentMethodId,
          paymentNumber: number,
          paymentDate,
          direction: input.direction,
          currencyCode: input.currencyCode,
          amount,
          reference: input.reference || null,
          notes: input.notes || null,
          idempotencyKey: input.idempotencyKey,
          preparedById: actor.userId,
          allocations: {
            create: allocations.map((allocation) => ({
              salesInvoiceId: allocation.salesInvoiceId || null,
              purchaseReceiptId: allocation.purchaseReceiptId || null,
              amount: allocation.amount,
            })),
          },
        },
        include: { allocations: true },
      });
      await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: input.branchId, action: "PAYMENT_DRAFT_CREATED", module: "finance", entityType: "Payment", entityId: payment.id, entityReference: payment.paymentNumber, newValues: { status: payment.status, amount: moneyString(payment.amount), direction: payment.direction, paymentMethodId }, metadata: { settlementSource: paymentMethodId ? "PAYMENT_METHOD" : "DIRECT_ACCOUNT" } }, tx);
      return payment;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updatePaymentDraft(actor: PaymentActor, id: string, input: PaymentDraftInput) {
  const paymentDate = parseOperationDate(input.paymentDate, "Payment date");
  const amount = decimal(input.amount);
  const allocations = input.allocations.map((allocation) => ({ ...allocation, amount: decimal(allocation.amount) }));
  const allocated = allocations.reduce((sum, allocation) => sum.plus(allocation.amount), zero());
  if (allocated.gt(amount)) throw new ApiError(422, "OVER_ALLOCATION", "Payment allocations exceed the payment amount.");
  const expectedParty = paymentPartyKind(input.direction);
  if (expectedParty === "customer" && (!input.customerId || input.supplierId)) throw new ApiError(422, "INVALID_PAYMENT_PARTY", "Customer receipts and refunds require one customer.");
  if (expectedParty === "supplier" && (!input.supplierId || input.customerId)) throw new ApiError(422, "INVALID_PAYMENT_PARTY", "Supplier payments and refunds require one supplier.");

  return prisma.$transaction(
    async (tx) => {
      const current = await lockPayment(tx, id, actor.companyId);
      if (!current) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment was not found.");
      if (
        current.status === OperationalDocumentStatus.POSTED ||
        current.status === OperationalDocumentStatus.REVERSED ||
        current.status === OperationalDocumentStatus.CANCELLED
      ) {
        throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Posted, reversed, or cancelled payment vouchers cannot be edited.");
      }
      // Revert parent status to DRAFT first so PaymentAllocation_parent_guard allows line changes
      if (current.status === OperationalDocumentStatus.SUBMITTED || current.status === OperationalDocumentStatus.APPROVED) {
        await tx.payment.update({
          where: { id },
          data: { status: OperationalDocumentStatus.DRAFT, approvedById: null, approvedAt: null },
        });
      }

      let cashAccountId = input.cashAccountId || null;
      let bankAccountId = input.bankAccountId || null;
      let paymentMethodId: string | null = null;
      if (input.paymentMethodId) {
        const method = await tx.paymentMethod.findFirst({ where: { id: input.paymentMethodId, companyId: actor.companyId } });
        if (!method) throw new ApiError(404, "PAYMENT_METHOD_NOT_FOUND", "The selected payment method was not found.");
        if (!method.isActive) throw new ApiError(409, "PAYMENT_METHOD_INACTIVE", "The selected payment method is inactive.");
        if (method.requiresReference && !input.reference) throw new ApiError(422, "PAYMENT_REFERENCE_REQUIRED", `${method.name} requires a reference number.`);
        if (method.cashAccountId && cashAccountId && cashAccountId !== method.cashAccountId) throw new ApiError(422, "PAYMENT_METHOD_MISMATCH", `${method.name} settles into a different cash account.`);
        if (method.bankAccountId && bankAccountId && bankAccountId !== method.bankAccountId) throw new ApiError(422, "PAYMENT_METHOD_MISMATCH", `${method.name} settles into a different bank account.`);
        cashAccountId = method.cashAccountId ?? cashAccountId;
        bankAccountId = method.bankAccountId ?? bankAccountId;
        paymentMethodId = method.id;
      }
      if (Boolean(bankAccountId) === Boolean(cashAccountId)) throw new ApiError(422, "PAYMENT_SETTLEMENT_REQUIRED", "Choose a payment method or exactly one bank or cash account.");

      const party = expectedParty === "customer"
        ? await tx.customer.findFirst({ where: { id: input.customerId!, companyId: actor.companyId, status: "ACTIVE" } })
        : await tx.supplier.findFirst({ where: { id: input.supplierId!, companyId: actor.companyId, status: "ACTIVE" } });
      if (!party) throw new ApiError(404, "PARTY_NOT_FOUND", "The selected active payment party was not found.");

      if (bankAccountId) {
        const bank = await tx.bankAccount.findFirst({ where: { id: bankAccountId, companyId: actor.companyId, branchId: input.branchId, isActive: true } });
        if (!bank) throw new ApiError(404, "BANK_ACCOUNT_NOT_FOUND", "The selected active bank account was not found in this branch.");
        if (bank.currencyCode !== input.currencyCode) throw new ApiError(422, "CURRENCY_MISMATCH", "Payment and bank account currencies must match.");
      } else {
        const cash = await tx.account.findFirst({ where: { id: cashAccountId!, companyId: actor.companyId, accountType: "CASH", isActive: true, OR: [{ branchId: input.branchId }, { branchId: null }] } });
        if (!cash) throw new ApiError(404, "CASH_ACCOUNT_NOT_FOUND", "The selected active cash account was not found in this branch.");
        if (cash.currencyCode && cash.currencyCode !== input.currencyCode) throw new ApiError(422, "CURRENCY_MISMATCH", "Payment and cash account currencies must match.");
      }

      await tx.paymentAllocation.deleteMany({ where: { paymentId: id } });

      const updated = await tx.payment.update({
        where: { id },
        data: {
          branchId: input.branchId,
          customerId: input.customerId || null,
          supplierId: input.supplierId || null,
          bankAccountId,
          cashAccountId,
          paymentMethodId,
          paymentDate,
          direction: input.direction,
          currencyCode: input.currencyCode,
          amount,
          reference: input.reference || null,
          notes: input.notes || null,
          preparedById: actor.userId,
          status: OperationalDocumentStatus.DRAFT,
          approvedById: null,
          approvedAt: null,
          allocations: {
            create: allocations.map((allocation) => ({
              salesInvoiceId: allocation.salesInvoiceId || null,
              purchaseReceiptId: allocation.purchaseReceiptId || null,
              amount: allocation.amount,
            })),
          },
        },
        include: { allocations: true },
      });

      await appendAudit({
        companyId: actor.companyId,
        actorId: actor.userId,
        branchId: input.branchId,
        action: "PAYMENT_DRAFT_UPDATED",
        module: "finance",
        entityType: "Payment",
        entityId: id,
        entityReference: updated.paymentNumber,
        previousValues: { amount: moneyString(current.amount), status: current.status },
        newValues: { amount: moneyString(updated.amount), status: updated.status },
        metadata: { settlementSource: paymentMethodId ? "PAYMENT_METHOD" : "DIRECT_ACCOUNT" },
      }, tx);

      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function submitPayment(actor: PaymentActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const payment = await lockPayment(tx, id, actor.companyId);
    if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment was not found.");
    if (payment.status === OperationalDocumentStatus.SUBMITTED) {
      return payment;
    }
    const canSubmit =
      payment.preparedById === actor.userId ||
      !actor.permissions ||
      actor.permissions.includes("PAYMENT_APPROVE") ||
      actor.permissions.includes("PAYMENT_CREATE") ||
      actor.permissions.includes("PAYMENT_POST") ||
      actor.permissions.includes("finance.manage");
    if (!canSubmit) throw new ApiError(403, "NOT_PREPARER", "Only the preparer or authorized staff may submit this payment.");
    if (payment.status !== OperationalDocumentStatus.DRAFT) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a draft payment can be submitted.");
    const updated = await tx.payment.update({ where: { id }, data: { status: OperationalDocumentStatus.SUBMITTED } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: payment.branchId, action: "PAYMENT_SUBMITTED", module: "finance", entityType: "Payment", entityId: id, entityReference: payment.paymentNumber, previousValues: { status: payment.status }, newValues: { status: updated.status } }, tx);
    return updated;
  });
}

async function validateAllocations(tx: Prisma.TransactionClient, payment: NonNullable<Awaited<ReturnType<typeof lockPayment>>>) {
  for (const allocation of payment.allocations) {
    if (allocation.salesInvoice) {
      if (allocation.salesInvoice.companyId !== payment.companyId || allocation.salesInvoice.customerId !== payment.customerId || allocation.salesInvoice.status !== OperationalDocumentStatus.POSTED || allocation.salesInvoice.reversalOfId !== null) {
        throw new ApiError(409, "INVALID_ALLOCATION", "A sales allocation does not reference a posted invoice for this customer.");
      }
      const totals = await tx.$queryRaw<Array<{ settled: Prisma.Decimal }>>(Prisma.sql`
        SELECT COALESCE(SUM(CASE p."direction" WHEN 'CUSTOMER_RECEIPT' THEN a."amount" ELSE -a."amount" END),0)::numeric(19,4) AS settled
        FROM "PaymentAllocation" a JOIN "Payment" p ON p."id" = a."paymentId"
        WHERE a."salesInvoiceId" = ${allocation.salesInvoiceId}::uuid AND p."status" = 'POSTED'
      `);
      const settled = totals[0]?.settled || zero();
      if (payment.direction === PaymentDirection.CUSTOMER_RECEIPT && settled.plus(allocation.amount).gt(allocation.salesInvoice.grandTotal)) {
        throw new ApiError(409, "INVOICE_OVERPAYMENT", `Allocation exceeds the open amount on invoice ${allocation.salesInvoice.invoiceNumber}.`);
      }
      if (payment.direction === PaymentDirection.CUSTOMER_REFUND && allocation.amount.gt(settled)) {
        throw new ApiError(409, "REFUND_EXCEEDS_RECEIPTS", `Refund allocation exceeds settled receipts on invoice ${allocation.salesInvoice.invoiceNumber}.`);
      }
    } else if (allocation.purchaseReceipt) {
      if (allocation.purchaseReceipt.companyId !== payment.companyId || allocation.purchaseReceipt.supplierId !== payment.supplierId || allocation.purchaseReceipt.status !== OperationalDocumentStatus.POSTED || allocation.purchaseReceipt.reversalOfId !== null) {
        throw new ApiError(409, "INVALID_ALLOCATION", "A supplier allocation does not reference a posted receipt for this supplier.");
      }
      const totals = await tx.$queryRaw<Array<{ settled: Prisma.Decimal }>>(Prisma.sql`
        SELECT COALESCE(SUM(CASE p."direction" WHEN 'SUPPLIER_PAYMENT' THEN a."amount" ELSE -a."amount" END),0)::numeric(19,4) AS settled
        FROM "PaymentAllocation" a JOIN "Payment" p ON p."id" = a."paymentId"
        WHERE a."purchaseReceiptId" = ${allocation.purchaseReceiptId}::uuid AND p."status" = 'POSTED'
      `);
      const settled = totals[0]?.settled || zero();
      if (payment.direction === PaymentDirection.SUPPLIER_PAYMENT && settled.plus(allocation.amount).gt(allocation.purchaseReceipt.grandTotal)) {
        throw new ApiError(409, "SUPPLIER_OVERPAYMENT", `Allocation exceeds the open amount on receipt ${allocation.purchaseReceipt.receiptNumber}.`);
      }
      if (payment.direction === PaymentDirection.SUPPLIER_REFUND && allocation.amount.gt(settled)) {
        throw new ApiError(409, "REFUND_EXCEEDS_PAYMENTS", `Supplier refund allocation exceeds prior payments on receipt ${allocation.purchaseReceipt.receiptNumber}.`);
      }
    }
  }
}

export async function approvePayment(actor: PaymentActor, id: string) {
  return prisma.$transaction(async (tx) => {
    await ensureSingleUserDatabase(tx as any);
    const payment = await lockPayment(tx, id, actor.companyId);
    if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment was not found.");
    if (payment.status === OperationalDocumentStatus.APPROVED || payment.status === OperationalDocumentStatus.POSTED) return payment;
    await validateAllocations(tx, payment);
    const updated = await tx.payment.update({ where: { id }, data: { status: OperationalDocumentStatus.APPROVED, approvedById: actor.userId, approvedAt: new Date() } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: payment.branchId, action: "PAYMENT_APPROVED", module: "finance", entityType: "Payment", entityId: id, entityReference: payment.paymentNumber, previousValues: { status: payment.status }, newValues: { status: updated.status } }, tx);
    return updated;
  });
}

export async function postPayment(actor: PaymentActor, id: string) {
  if (actor.permissions && !actor.permissions.includes("PAYMENT_POST") && !actor.permissions.includes("finance.manage")) {
    throw new ApiError(403, "FORBIDDEN", "Permission PAYMENT_POST is required to post payment vouchers.");
  }

  return prisma.$transaction(
    async (tx) => {
      await ensureSingleUserDatabase(tx as any);
      const payment = await lockPayment(tx, id, actor.companyId);
      if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment was not found.");
      if (payment.status === OperationalDocumentStatus.POSTED) return payment;
      const eligibleStatuses: OperationalDocumentStatus[] = [
        OperationalDocumentStatus.DRAFT,
        OperationalDocumentStatus.SUBMITTED,
        OperationalDocumentStatus.APPROVED,
      ];
      if (!eligibleStatuses.includes(payment.status)) {
        throw new ApiError(
          409,
          "INVALID_DOCUMENT_STATE",
          `Cannot post a payment with status ${payment.status}. Only draft or submitted vouchers can be posted.`
        );
      }

      if ((payment.customer && payment.customer.status !== "ACTIVE") || (payment.supplier && payment.supplier.status !== "ACTIVE")) {
        throw new ApiError(409, "PARTY_INACTIVE", "The payment party is no longer active.");
      }
      await validateAllocations(tx, payment);
      let settlementAccountId: string;
      let bankAccountId: string | null = null;
      if (payment.bankAccount) {
        if (!payment.bankAccount.isActive || payment.bankAccount.currencyCode !== payment.currencyCode) {
          throw new ApiError(409, "BANK_ACCOUNT_UNAVAILABLE", "The payment bank account is unavailable or uses a different currency.");
        }
        settlementAccountId = payment.bankAccount.glAccountId;
        bankAccountId = payment.bankAccount.id;
      } else if (payment.cashAccount) {
        if (!payment.cashAccount.isActive || payment.cashAccount.accountType !== "CASH") {
          throw new ApiError(409, "CASH_ACCOUNT_UNAVAILABLE", "The payment cash account is unavailable.");
        }
        settlementAccountId = payment.cashAccount.id;
      } else {
        throw new ApiError(409, "SETTLEMENT_ACCOUNT_MISSING", "The payment has no settlement account.");
      }
      const isCustomer = paymentPartyKind(payment.direction) === "customer";
      const controlAccount = await requirePostingAccount(tx, {
        companyId: actor.companyId,
        branchId: payment.branchId,
        accountType: isCustomer ? "ACCOUNTS_RECEIVABLE" : "ACCOUNTS_PAYABLE",
      });
      const incoming = payment.direction === PaymentDirection.CUSTOMER_RECEIPT || payment.direction === PaymentDirection.SUPPLIER_REFUND;
      const partyDescription = payment.customer?.name || payment.supplier?.name || "party";
      const common = {
        customerId: payment.customerId,
        supplierId: payment.supplierId,
      };
      const journal = await postOperationalJournal(tx, {
        actor,
        branchId: payment.branchId,
        postingDate: payment.paymentDate,
        preparedById: payment.preparedById,
        approvedById: payment.approvedById || actor.userId,
        documentType: "PAYMENT_JOURNAL",
        voucherSuffix: incoming ? "RC" : "PV",
        sourceModule: "PAYMENTS",
        sourceDocumentType: "Payment",
        sourceDocumentId: payment.id,
        sourceDocumentNumber: payment.paymentNumber,
        idempotencyKey: `PAYMENT:${payment.id}`,
        narration: `${payment.direction.replaceAll("_", " ")} ${payment.paymentNumber} for ${partyDescription}`,
        referenceDocument: payment.reference || payment.paymentNumber,
        allowApproverPosting: true,
        lines: incoming
          ? [
              { accountId: settlementAccountId, description: `Settlement received on ${payment.paymentNumber}`, debit: payment.amount, bankAccountId, ...common },
              { accountId: controlAccount.id, description: `Party ledger settlement on ${payment.paymentNumber}`, credit: payment.amount, ...common },
            ]
          : [
              { accountId: controlAccount.id, description: `Party ledger settlement on ${payment.paymentNumber}`, debit: payment.amount, ...common },
              { accountId: settlementAccountId, description: `Settlement paid on ${payment.paymentNumber}`, credit: payment.amount, bankAccountId, ...common },
            ],
      });
      const posted = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: OperationalDocumentStatus.POSTED,
          journalEntryId: journal.id,
          postedById: actor.userId,
          postedAt: new Date(),
        },
        include: { allocations: true, journalEntry: true },
      });
      await appendAudit(
        {
          companyId: actor.companyId,
          actorId: actor.userId,
          branchId: payment.branchId,
          action: "PAYMENT_POSTED",
          module: "finance",
          entityType: "Payment",
          entityId: payment.id,
          entityReference: payment.paymentNumber,
          previousValues: { status: payment.status },
          newValues: { status: posted.status, journalEntryId: journal.id },
          metadata: { amount: moneyString(payment.amount), direction: payment.direction },
        },
        tx,
      );
      return posted;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 },
  );
}

export async function cancelPayment(actor: PaymentActor, id: string, reason?: string) {
  if (actor.permissions && !actor.permissions.includes("PAYMENT_CANCEL") && !actor.permissions.includes("finance.manage")) {
    throw new ApiError(403, "FORBIDDEN", "Permission PAYMENT_CANCEL is required to cancel payment vouchers.");
  }

  return prisma.$transaction(
    async (tx) => {
      await ensureSingleUserDatabase(tx as any);
      const payment = await lockPayment(tx, id, actor.companyId);
      if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment voucher was not found.");
      if (payment.status === OperationalDocumentStatus.CANCELLED) return payment;
      if (
        payment.status !== OperationalDocumentStatus.DRAFT &&
        payment.status !== OperationalDocumentStatus.SUBMITTED
      ) {
        throw new ApiError(
          409,
          "INVALID_DOCUMENT_STATE",
          "Only draft or submitted payment vouchers can be cancelled. Use reversal for posted vouchers.",
        );
      }

      const normalizedReason = reason?.trim();
      const updatedNotes = normalizedReason
        ? (payment.notes ? `${payment.notes}\nCancellation reason: ${normalizedReason}` : `Cancellation reason: ${normalizedReason}`)
        : payment.notes;

      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: OperationalDocumentStatus.CANCELLED,
          notes: updatedNotes,
        },
        include: { allocations: true },
      });

      await appendAudit(
        {
          companyId: actor.companyId,
          actorId: actor.userId,
          branchId: payment.branchId,
          action: "PAYMENT_CANCELLED",
          module: "finance",
          entityType: "Payment",
          entityId: payment.id,
          entityReference: payment.paymentNumber,
          previousValues: { status: payment.status },
          newValues: { status: updated.status },
          metadata: { reason: normalizedReason || null, paymentNumber: payment.paymentNumber },
        },
        tx,
      );

      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function reversePayment(actor: PaymentActor, id: string, reason: string) {
  if (actor.permissions && !actor.permissions.includes("PAYMENT_REVERSE") && !actor.permissions.includes("finance.manage")) {
    throw new ApiError(403, "FORBIDDEN", "Permission PAYMENT_REVERSE is required to reverse payment vouchers.");
  }
  const normalizedReason = reason?.trim();
  if (!normalizedReason || normalizedReason.length < 5) {
    throw new ApiError(422, "REASON_REQUIRED", "A valid reversal reason of at least 5 characters is required.");
  }

  return prisma.$transaction(
    async (tx) => {
      await ensureSingleUserDatabase(tx as any);
      const payment = await lockPayment(tx, id, actor.companyId);
      if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment voucher was not found.");
      if (payment.status === OperationalDocumentStatus.REVERSED) {
        throw new ApiError(409, "PAYMENT_ALREADY_REVERSED", "This payment voucher has already been reversed.");
      }
      if (payment.status !== OperationalDocumentStatus.POSTED) {
        throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only posted payment vouchers can be reversed.");
      }
      if (!payment.journalEntryId) {
        throw new ApiError(409, "JOURNAL_ENTRY_MISSING", "The posted payment has no linked journal entry to reverse.");
      }
      const existingReversal = await tx.payment.findFirst({
        where: { reversalOfId: id },
      });
      if (existingReversal) {
        throw new ApiError(409, "PAYMENT_ALREADY_REVERSED", "This payment voucher has already been reversed.");
      }

      const incoming = payment.direction === PaymentDirection.CUSTOMER_RECEIPT || payment.direction === PaymentDirection.SUPPLIER_REFUND;
      const reversalJournal = await reverseOperationalJournal(tx, {
        actor,
        branchId: payment.branchId,
        originalJournalId: payment.journalEntryId,
        postingDate: new Date(),
        sourceModule: "PAYMENT_REVERSAL",
        sourceDocumentType: "Payment",
        sourceDocumentId: payment.id,
        sourceDocumentNumber: payment.paymentNumber,
        idempotencyKey: `PAYMENT-REVERSAL:${payment.id}`,
        documentType: "PAYMENT_REVERSAL_JOURNAL",
        voucherSuffix: incoming ? "RC" : "PV",
        narration: `Reversal of ${payment.paymentNumber}: ${normalizedReason}`,
        referenceDocument: payment.paymentNumber,
        allowApproverPosting: true,
      });

      const reversedAt = new Date();
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: OperationalDocumentStatus.REVERSED,
          reversalOfId: payment.id,
          reversedById: actor.userId,
          reversedAt,
          reversalReason: normalizedReason,
        },
        include: { allocations: true, journalEntry: true },
      });

      await appendAudit(
        {
          companyId: actor.companyId,
          actorId: actor.userId,
          branchId: payment.branchId,
          action: "PAYMENT_REVERSED",
          module: "finance",
          entityType: "Payment",
          entityId: payment.id,
          entityReference: payment.paymentNumber,
          previousValues: { status: payment.status },
          newValues: { status: updated.status, reversalJournalId: reversalJournal.id },
          metadata: { reason: normalizedReason, reversalJournalId: reversalJournal.id },
        },
        tx,
      );

      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 },
  );
}

export async function deletePayment(actor: PaymentActor, id: string) {
  return prisma.$transaction(
    async (tx) => {
      await ensureSingleUserDatabase(tx as any);
      const payment = await lockPayment(tx, id, actor.companyId);
      if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment voucher was not found.");
      if (
        payment.status === OperationalDocumentStatus.POSTED ||
        payment.status === OperationalDocumentStatus.REVERSED
      ) {
        throw new ApiError(
          409,
          "INVALID_DOCUMENT_STATE",
          "Posted or reversed payment vouchers cannot be deleted directly. You must reverse a posted payment instead.",
        );
      }

      // Revert parent status to DRAFT first so PaymentAllocation_parent_guard allows line deletion
      if (payment.status !== OperationalDocumentStatus.DRAFT) {
        await tx.payment.update({
          where: { id },
          data: { status: OperationalDocumentStatus.DRAFT, approvedById: null, approvedAt: null },
        });
      }

      await tx.paymentAllocation.deleteMany({ where: { paymentId: id } });
      await tx.payment.delete({ where: { id } });

      await appendAudit(
        {
          companyId: actor.companyId,
          actorId: actor.userId,
          branchId: payment.branchId,
          action: "PAYMENT_DELETED",
          module: "finance",
          entityType: "Payment",
          entityId: id,
          entityReference: payment.paymentNumber,
          previousValues: { amount: moneyString(payment.amount), status: payment.status },
          metadata: { paymentNumber: payment.paymentNumber },
        },
        tx,
      );

      return { id, paymentNumber: payment.paymentNumber, success: true };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
