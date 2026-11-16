import "server-only";

import {
  InventoryMovementType,
  JournalType,
  OperationalDocumentStatus,
  PaymentDirection,
  Prisma,
  ProductStatus,
  StockUnitStatus,
  TrackingMethod,
} from "@prisma/client";
import { ApiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { assertCreditOverrideAllowed, assertDiscountCap } from "@/lib/policies";
import { isSingleUserMode } from "@/lib/operating-mode";
import { decimal, moneyString, zero } from "@/lib/finance/money";
import { prisma } from "@/lib/prisma";
import {
  allocateOperationalNumber,
  postOperationalJournal,
  requirePostingAccount,
  type OperationalActor,
} from "@/lib/operations/accounting";
import {
  applyStockMovement,
  assertSufficientBalance,
  averageUnitCost,
  enableInventoryPosting,
  lockPhysicalStockUnit,
} from "@/lib/operations/inventory";
import { parseOperationDate } from "@/lib/operations/validation";
import { loadPriceFloors, resolveSalesPriceList } from "@/lib/catalog/pricing";

export type PosLineInput = {
  productId: string;
  variantId: string;
  taxRuleId?: string | null;
  taxRate?: string;
  description?: string;
  quantity: string;
  unitPrice: string;
  discountAmount?: string;
  stockUnitIds: string[];
};

export type PosTenderInput = {
  paymentMethod: "CASH" | "CARD" | "WALLET" | "BANK";
  cashAccountId?: string | null;
  bankAccountId?: string | null;
  amount: string;
  tenderedAmount?: string;
  changeAmount?: string;
  reference?: string | null;
  notes?: string | null;
};

export type PosCheckoutInput = {
  branchId: string;
  warehouseId: string;
  customerId: string;
  salespersonId?: string | null;
  terminalId?: string | null;
  shiftId?: string | null;
  priceListId?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  currencyCode: string;
  notes?: string | null;
  idempotencyKey: string;
  lines: PosLineInput[];
  tenders: PosTenderInput[];
  isCreditSale?: boolean;
  creditOverrideReason?: string | null;
  existingInvoiceId?: string | null;
};

export type PosShiftOpenInput = {
  branchId: string;
  terminalId: string;
  openingFloat: string;
  notes?: string | null;
};

export type PosShiftCloseInput = {
  shiftId: string;
  closingActualCash: string;
  notes?: string | null;
};

/**
 * Executes a high-performance, single atomic POS transaction:
 * - Validates catalog, dual-SIM handset physical units, and quantity stock balances
 * - Enforces minimum selling price floors and server-side tax/discount calculation
 * - Evaluates customer credit limits and validates managerial overrides
 * - Creates and directly posts the SalesInvoice to GL
 * - Updates physical handset custody to SOLD and issues stock movements
 * - Posts Customer Receipt payment vouchers for all tenders (Cash, Card, Wallet, Bank)
 * - Allocates payments against the invoice, leaving any remaining balance on Accounts Receivable
 * - All operations succeed together or rollback completely.
 */
export async function executePosCheckout(
  actor: OperationalActor,
  input: PosCheckoutInput,
) {
  if (input.currencyCode !== actor.currencyCode) {
    throw new ApiError(422, "CURRENCY_MISMATCH", "POS transactions must use the company base currency.");
  }
  if (!input.lines || input.lines.length === 0) {
    throw new ApiError(422, "EMPTY_CART", "Add at least one item to complete the sale.");
  }

  const invoiceDate = parseOperationDate(input.invoiceDate, "Invoice date");
  const dueDate = input.dueDate ? parseOperationDate(input.dueDate, "Due date") : null;
  if (dueDate && dueDate < invoiceDate) {
    throw new ApiError(422, "INVALID_DUE_DATE", "Due date cannot be earlier than invoice date.");
  }

  return prisma.$transaction(
    async (tx) => {
      // 1. Idempotency Check: Return existing sale if already processed and posted
      const existing = await tx.salesInvoice.findUnique({
        where: {
          companyId_idempotencyKey: {
            companyId: actor.companyId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: {
          lines: {
            include: {
              units: { include: { stockUnit: { include: { identifiers: true } } } },
              product: true,
              variant: true,
            },
            orderBy: { lineNumber: "asc" },
          },
          allocations: {
            include: {
              payment: {
                include: { cashAccount: true, bankAccount: true },
              },
            },
          },
          customer: true,
        },
      });
      if (existing && existing.status === OperationalDocumentStatus.POSTED) {
        return {
          invoice: existing,
          isDuplicate: true,
          payments: existing.allocations.map((a) => a.payment),
          remainingCreditBalance: moneyString(
            existing.grandTotal.minus(existing.allocations.reduce((sum, a) => sum.plus(a.amount), zero())),
          ),
        };
      }

      // Check if editing/checking out an existing draft or unposted document
      const targetExistingId = input.existingInvoiceId || (existing && existing.status !== OperationalDocumentStatus.POSTED ? existing.id : null);
      const existingInvoice = targetExistingId
        ? await tx.salesInvoice.findFirst({
            where: { id: targetExistingId, companyId: actor.companyId },
            include: { lines: { select: { id: true } } },
          })
        : null;

      if (existingInvoice) {
        if (
          existingInvoice.status === OperationalDocumentStatus.POSTED ||
          existingInvoice.status === OperationalDocumentStatus.REVERSED ||
          existingInvoice.status === OperationalDocumentStatus.CANCELLED
        ) {
          throw new ApiError(409, "INVALID_DOCUMENT_STATE", "This sales invoice is already posted or closed.");
        }
      }

      // 2. Validate Branch, Warehouse, Customer & Salesperson
      const salespersonId = input.salespersonId || actor.userId;
      const [customer, warehouse, salesperson] = await Promise.all([
        tx.customer.findFirst({
          where: {
            id: input.customerId,
            companyId: actor.companyId,
            status: "ACTIVE",
            OR: [{ branchId: null }, { branchId: input.branchId }],
          },
        }),
        tx.warehouse.findFirst({
          where: {
            id: input.warehouseId,
            companyId: actor.companyId,
            branchId: input.branchId,
            allowDispatch: true,
            isActive: true,
          },
        }),
        tx.companyMembership.findFirst({
          where: {
            companyId: actor.companyId,
            userId: salespersonId,
            status: "ACTIVE",
            user: { status: "ACTIVE" },
          },
          select: { userId: true },
        }),
      ]);

      if (!customer) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "The selected active customer was not found in this branch.");
      if (!warehouse) throw new ApiError(404, "WAREHOUSE_NOT_FOUND", "The selected dispatch warehouse was not found.");
      if (!salesperson) throw new ApiError(422, "SALESPERSON_NOT_FOUND", "The selected active salesperson does not belong to this company.");

      // 3. Validate Terminal and Shift (if provided)
      if (input.terminalId) {
        const terminal = await tx.posTerminal.findFirst({
          where: { id: input.terminalId, companyId: actor.companyId, branchId: input.branchId, isActive: true },
        });
        if (!terminal) throw new ApiError(404, "TERMINAL_NOT_FOUND", "Selected POS terminal is invalid or inactive.");
      }
      if (input.shiftId) {
        const shift = await tx.posShift.findFirst({
          where: { id: input.shiftId, companyId: actor.companyId, status: "OPEN" },
        });
        if (!shift) throw new ApiError(409, "SHIFT_NOT_OPEN", "Selected POS shift is closed or invalid.");
      }

      // 4. Duplicate Stock Units Validation in Cart
      const allStockUnitIds = input.lines.flatMap((line) => line.stockUnitIds || []);
      if (new Set(allStockUnitIds).size !== allStockUnitIds.length) {
        throw new ApiError(422, "DUPLICATE_STOCK_UNIT", "A physical handset can appear only once in the cart.");
      }

      // 5. Load Products, Variants, Price List, and Stock Units
      const productIds = [...new Set(input.lines.map((l) => l.productId))];
      const variantIds = [...new Set(input.lines.map((l) => l.variantId))];

      const [products, variants, stockUnits] = await Promise.all([
        tx.product.findMany({
          where: { id: { in: productIds }, companyId: actor.companyId, status: ProductStatus.ACTIVE },
          select: {
            id: true,
            name: true,
            trackingMethod: true,
            taxRuleId: true,
            taxRule: { select: { id: true, rate: true, isActive: true, appliesToSales: true } },
          },
        }),
        tx.productVariant.findMany({
          where: { id: { in: variantIds }, companyId: actor.companyId, isActive: true },
          select: { id: true, productId: true, name: true, sku: true, minimumSellingPrice: true, retailPrice: true },
        }),
        allStockUnitIds.length > 0
          ? tx.physicalStockUnit.findMany({
              where: { id: { in: allStockUnitIds }, companyId: actor.companyId },
              include: { identifiers: true },
            })
          : Promise.resolve([]),
      ]);

      if (stockUnits.length !== allStockUnitIds.length) {
        throw new ApiError(422, "STOCK_UNIT_NOT_FOUND", "One or more selected physical handsets were not found in inventory.");
      }

      const productMap = new Map(products.map((p) => [p.id, p]));
      const variantMap = new Map(variants.map((v) => [v.id, v]));
      const stockUnitMap = new Map(stockUnits.map((u) => [u.id, u]));

      // 6. Resolve Price List & Floors
      const priceList = await resolveSalesPriceList(tx, {
        companyId: actor.companyId,
        customerId: input.customerId,
        priceListId: input.priceListId || null,
        onDate: invoiceDate,
      });
      const priceFloors = await loadPriceFloors(tx, {
        companyId: actor.companyId,
        priceListId: priceList?.id ?? null,
        variantIds,
      });

      // 7. Calculate Lines, Validate Prices, Discounts, and Taxes
      let subtotal = zero();
      let discountTotal = zero();
      let taxTotal = zero();

      const preparedLines = input.lines.map((line, index) => {
        const product = productMap.get(line.productId);
        const variant = variantMap.get(line.variantId);
        if (!product || !variant || variant.productId !== product.id) {
          throw new ApiError(422, "INVALID_PRODUCT", `Sales line ${index + 1} product or variant is unavailable.`);
        }

        const quantity = decimal(String(line.quantity));
        if (quantity.lte(0)) {
          throw new ApiError(422, "INVALID_QUANTITY", `Sales line ${index + 1} quantity must be greater than zero.`);
        }

        const unitPrice = decimal(String(line.unitPrice));
        const discountAmount = decimal(String(line.discountAmount || 0));
        const gross = quantity.times(unitPrice).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        if (discountAmount.gt(gross)) {
          throw new ApiError(422, "INVALID_DISCOUNT", `Sales line ${index + 1} discount exceeds its gross line amount.`);
        }

        // Price Floor Verification
        const effectiveUnitPrice = gross.minus(discountAmount).div(quantity).toDecimalPlaces(4);
        const listFloor = priceFloors.get(line.variantId)?.minimumPrice ?? null;
        const floor = listFloor ?? variant.minimumSellingPrice;
        if (effectiveUnitPrice.lt(floor)) {
          throw new ApiError(
            409,
            "PRICE_BELOW_MINIMUM",
            `Sales line ${index + 1} (${product.name}) effective unit price is below the configured ${listFloor ? "price list" : "variant"} minimum floor.`,
          );
        }

        // Tax Calculation
        const taxRate = product.taxRule?.rate ?? zero();
        const taxableAmount = gross.minus(discountAmount);
        const taxAmount = taxableAmount.times(taxRate).div(100).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        const lineTotal = taxableAmount.plus(taxAmount).toDecimalPlaces(4);

        subtotal = subtotal.plus(gross);
        discountTotal = discountTotal.plus(discountAmount);
        taxTotal = taxTotal.plus(taxAmount);

        // Tracking Method Verification
        const serialized = product.trackingMethod === TrackingMethod.IMEI || product.trackingMethod === TrackingMethod.SERIAL;
        if (serialized) {
          if (!quantity.isInteger() || line.stockUnitIds.length !== quantity.toNumber()) {
            throw new ApiError(422, "SERIALIZED_QUANTITY_MISMATCH", `Handset line ${index + 1} (${product.name}) requires exactly one physical IMEI unit per count.`);
          }
        } else {
          if (line.stockUnitIds.length > 0) {
            throw new ApiError(422, "UNEXPECTED_STOCK_UNITS", `Quantity-based accessory line ${index + 1} (${product.name}) cannot contain physical stock units.`);
          }
        }

        return {
          lineNumber: index + 1,
          productId: line.productId,
          variantId: line.variantId,
          taxRuleId: product.taxRule?.id ?? null,
          taxRate,
          description: line.description || `${product.name} · ${variant.name}`,
          quantity,
          unitPrice,
          discountAmount,
          taxAmount,
          lineTotal,
          stockUnitIds: line.stockUnitIds,
          product,
          variant,
          serialized,
        };
      });

      subtotal = subtotal.toDecimalPlaces(4);
      discountTotal = discountTotal.toDecimalPlaces(4);
      taxTotal = taxTotal.toDecimalPlaces(4);
      const grandTotal = subtotal.minus(discountTotal).plus(taxTotal).toDecimalPlaces(4);

      // Commercial discount cap check
      await assertDiscountCap(tx, {
        actor,
        subtotal,
        discountTotal,
        entityId: input.idempotencyKey,
        reference: "POS Counter Sale",
      });

      // 8. Tenders Validation & Credit Balance
      let totalNonCreditTenders = zero();
      const validTenders = (input.tenders || []).filter((t) => decimal(String(t.amount || 0)).gt(0));

      for (const tender of validTenders) {
        const tenderAmt = decimal(String(tender.amount));
        totalNonCreditTenders = totalNonCreditTenders.plus(tenderAmt);

        if (tender.paymentMethod === "CASH") {
          if (!tender.cashAccountId) throw new ApiError(422, "CASH_ACCOUNT_REQUIRED", "Select a cash drawer account for cash tender.");
          const cash = await tx.account.findFirst({
            where: {
              id: tender.cashAccountId,
              companyId: actor.companyId,
              accountType: "CASH",
              isActive: true,
              OR: [{ branchId: input.branchId }, { branchId: null }],
            },
          });
          if (!cash) throw new ApiError(404, "CASH_ACCOUNT_NOT_FOUND", "The selected cash drawer account is invalid or inactive.");
        } else {
          if (!tender.bankAccountId) throw new ApiError(422, "BANK_ACCOUNT_REQUIRED", `Select a bank/deposit account for ${tender.paymentMethod} tender.`);
          const bank = await tx.bankAccount.findFirst({
            where: {
              id: tender.bankAccountId,
              companyId: actor.companyId,
              branchId: input.branchId,
              isActive: true,
            },
          });
          if (!bank) throw new ApiError(404, "BANK_ACCOUNT_NOT_FOUND", "The selected bank account is invalid or inactive.");
        }
      }

      totalNonCreditTenders = totalNonCreditTenders.toDecimalPlaces(4);
      if (totalNonCreditTenders.gt(grandTotal)) {
        // If single cash payment with change return, cap tender at grandTotal
        if (validTenders.length === 1 && validTenders[0].paymentMethod === "CASH") {
          validTenders[0].amount = grandTotal.toString();
          totalNonCreditTenders = grandTotal;
        } else {
          throw new ApiError(422, "OVER_TENDERED", `Tender allocations (${moneyString(totalNonCreditTenders)}) exceed invoice grand total (${moneyString(grandTotal)}).`);
        }
      }

      const remainingCreditBalance = grandTotal.minus(totalNonCreditTenders).toDecimalPlaces(4);

      // Walk-in counter customers cannot buy on credit
      if (customer.code === "WALK-IN" && remainingCreditBalance.gt(0)) {
        throw new ApiError(422, "WALK_IN_CREDIT_PROHIBITED", "Walk-in counter customers must pay in full at checkout. Credit balances require a registered customer account.");
      }

      // Check Customer Credit Limit for Credit Balance
      if (remainingCreditBalance.gt(0)) {
        const receivable = await requirePostingAccount(tx, {
          companyId: actor.companyId,
          branchId: input.branchId,
          accountType: "ACCOUNTS_RECEIVABLE",
        });
        const rows = await tx.$queryRaw<Array<{ balance: Prisma.Decimal }>>(Prisma.sql`
          SELECT COALESCE(SUM(l."baseDebit" - l."baseCredit"), 0)::numeric(19,4) AS balance
          FROM "JournalEntryLine" l JOIN "JournalEntry" j ON j."id" = l."entryId"
          WHERE j."companyId" = ${actor.companyId}::uuid AND j."status" = 'POSTED'
            AND l."accountId" = ${receivable.id}::uuid AND l."customerId" = ${customer.id}::uuid
        `);
        const currentAR = rows[0]?.balance || zero();
        const projectedAR = currentAR.plus(remainingCreditBalance);

        if (projectedAR.gt(customer.creditLimit)) {
          const singleUser = await isSingleUserMode(tx, actor.companyId);
          const overrideActor: OperationalActor = {
            ...actor,
            overrideReason: input.creditOverrideReason || undefined,
          };
          const reason = assertCreditOverrideAllowed(
            overrideActor,
            { outstanding: currentAR, invoiceTotal: remainingCreditBalance, creditLimit: customer.creditLimit },
            singleUser,
          );
          await appendAudit({
            companyId: actor.companyId,
            actorId: actor.userId,
            branchId: input.branchId,
            warehouseId: input.warehouseId,
            action: "CREDIT_LIMIT_OVERRIDDEN",
            module: "sales",
            entityType: "SalesInvoice",
            entityId: input.idempotencyKey,
            entityReference: "POS Counter Sale",
            metadata: {
              reason,
              currentAR: currentAR.toFixed(4),
              remainingCreditBalance: remainingCreditBalance.toFixed(4),
              creditLimit: customer.creditLimit.toFixed(4),
            },
          }, tx);
        }
      }

      // 9. Physical Stock Verification & Cost Calculation
      await enableInventoryPosting(tx);

      let totalCost = zero();
      const lineCostMap = new Map<number, { total: Prisma.Decimal; unitCost: Prisma.Decimal }>();

      for (const line of preparedLines) {
        let lineCost = zero();
        let unitCost = zero();

        if (line.serialized) {
          for (const stockUnitId of line.stockUnitIds) {
            const unit = await lockPhysicalStockUnit(tx, { companyId: actor.companyId, stockUnitId });
            if (
              unit.status !== StockUnitStatus.IN_STOCK ||
              unit.currentWarehouseId !== input.warehouseId ||
              unit.productId !== line.productId ||
              unit.variantId !== line.variantId
            ) {
              const imeiStr = unit.identifiers.map((i) => i.value).join(" / ");
              throw new ApiError(
                409,
                "STOCK_UNIT_UNAVAILABLE",
                `Device (${imeiStr}) is no longer available in the selected dispatch warehouse (status: ${unit.status}).`,
              );
            }

            const reservation = await tx.inventoryReservation.findFirst({
              where: {
                companyId: actor.companyId,
                stockUnitId: unit.id,
                releasedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
              select: { id: true },
            });
            if (reservation) {
              throw new ApiError(409, "STOCK_UNIT_RESERVED", `Device (${unit.id}) is reserved by another active order.`);
            }

            lineCost = lineCost.plus(unit.acquisitionCost);
          }
          unitCost = lineCost.div(line.quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        } else {
          await tx.$queryRaw(Prisma.sql`
            SELECT "id" FROM "StockBalance"
            WHERE "companyId" = ${actor.companyId}::uuid AND "branchId" = ${input.branchId}::uuid
              AND "warehouseId" = ${input.warehouseId}::uuid AND "productId" = ${line.productId}::uuid
              AND "variantId" = ${line.variantId}::uuid AND "lotId" IS NULL FOR UPDATE
          `);
          const balance = await tx.stockBalance.findFirst({
            where: {
              companyId: actor.companyId,
              branchId: input.branchId,
              warehouseId: input.warehouseId,
              productId: line.productId,
              variantId: line.variantId,
              lotId: null,
            },
          });
          assertSufficientBalance(balance, line.quantity);

          const reservations = await tx.inventoryReservation.aggregate({
            where: {
              companyId: actor.companyId,
              branchId: input.branchId,
              warehouseId: input.warehouseId,
              productId: line.productId,
              variantId: line.variantId,
              stockUnitId: null,
              releasedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            _sum: { quantity: true },
          });
          const reserved = reservations._sum.quantity || zero();
          if (balance!.quantity.minus(reserved).lt(line.quantity)) {
            throw new ApiError(
              409,
              "INSUFFICIENT_AVAILABLE_STOCK",
              `Accessory line ${line.lineNumber} (${line.product.name}) exceeds stock available after active reservations.`,
              { onHand: balance!.quantity.toFixed(4), reserved: reserved.toFixed(4), requested: line.quantity.toFixed(4) },
            );
          }

          unitCost = averageUnitCost(balance!);
          lineCost = line.quantity.equals(balance!.quantity)
            ? balance!.inventoryValue
            : unitCost.times(line.quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        }

        lineCostMap.set(line.lineNumber, { total: lineCost, unitCost });
        totalCost = totalCost.plus(lineCost);
      }
      totalCost = totalCost.toDecimalPlaces(4);

      // 10. Sequential Invoice Number & Document Preparation
      const invoiceNumber = existingInvoice
        ? existingInvoice.invoiceNumber
        : (
            await allocateOperationalNumber(tx, {
              companyId: actor.companyId,
              branchId: input.branchId,
              postingDate: invoiceDate,
              documentType: "SALES_INVOICE",
              suffix: "SI",
            })
          ).number;

      // 11. Create or Update SalesInvoice in DRAFT initially (so lines are linked)
      let invoice;
      if (existingInvoice) {
        const oldLineIds = existingInvoice.lines.map((l) => l.id);
        if (oldLineIds.length > 0) {
          await tx.salesInvoiceUnit.deleteMany({ where: { invoiceLineId: { in: oldLineIds } } });
          await tx.salesInvoiceLine.deleteMany({ where: { invoiceId: existingInvoice.id } });
        }
        invoice = await tx.salesInvoice.update({
          where: { id: existingInvoice.id },
          data: {
            branchId: input.branchId,
            warehouseId: input.warehouseId,
            customerId: customer.id,
            salespersonId,
            priceListId: priceList?.id || null,
            terminalId: input.terminalId || null,
            shiftId: input.shiftId || null,
            invoiceDate,
            dueDate: remainingCreditBalance.gt(0) ? (dueDate || invoiceDate) : null,
            currencyCode: input.currencyCode,
            subtotal,
            discountTotal,
            taxTotal,
            grandTotal,
            costTotal: totalCost,
            idempotencyKey: input.idempotencyKey,
            notes: input.notes || "POS Counter Sale",
            status: OperationalDocumentStatus.DRAFT,
            lines: {
              create: preparedLines.map((line) => ({
                productId: line.productId,
                variantId: line.variantId,
                taxRuleId: line.taxRuleId,
                taxRate: line.taxRate,
                lineNumber: line.lineNumber,
                description: line.description,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                discountAmount: line.discountAmount,
                taxAmount: line.taxAmount,
                lineTotal: line.lineTotal,
                costTotal: lineCostMap.get(line.lineNumber)!.total,
                units: {
                  create: line.stockUnitIds.map((stockUnitId) => ({ stockUnitId })),
                },
              })),
            },
          },
          include: {
            lines: { include: { units: true }, orderBy: { lineNumber: "asc" } },
          },
        });
      } else {
        invoice = await tx.salesInvoice.create({
          data: {
            companyId: actor.companyId,
            branchId: input.branchId,
            warehouseId: input.warehouseId,
            customerId: customer.id,
            salespersonId,
            priceListId: priceList?.id || null,
            terminalId: input.terminalId || null,
            shiftId: input.shiftId || null,
            invoiceNumber,
            invoiceDate,
            dueDate: remainingCreditBalance.gt(0) ? (dueDate || invoiceDate) : null,
            currencyCode: input.currencyCode,
            subtotal,
            discountTotal,
            taxTotal,
            grandTotal,
            costTotal: totalCost,
            idempotencyKey: input.idempotencyKey,
            notes: input.notes || "POS Counter Sale",
            preparedById: actor.userId,
            status: OperationalDocumentStatus.DRAFT,
            lines: {
              create: preparedLines.map((line) => ({
                productId: line.productId,
                variantId: line.variantId,
                taxRuleId: line.taxRuleId,
                taxRate: line.taxRate,
                lineNumber: line.lineNumber,
                description: line.description,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                discountAmount: line.discountAmount,
                taxAmount: line.taxAmount,
                lineTotal: line.lineTotal,
                costTotal: lineCostMap.get(line.lineNumber)!.total,
                units: {
                  create: line.stockUnitIds.map((stockUnitId) => ({ stockUnitId })),
                },
              })),
            },
          },
          include: {
            lines: { include: { units: true }, orderBy: { lineNumber: "asc" } },
          },
        });
      }

      // 12. Post Balanced Sales & COGS Journal Entry (SV)
      const [receivableAccount, revenueAccount, cogsAccount, inventoryAccount] = await Promise.all([
        requirePostingAccount(tx, { companyId: actor.companyId, branchId: input.branchId, accountType: "ACCOUNTS_RECEIVABLE" }),
        requirePostingAccount(tx, { companyId: actor.companyId, branchId: input.branchId, accountType: "SALES_REVENUE" }),
        requirePostingAccount(tx, { companyId: actor.companyId, branchId: input.branchId, accountType: "COGS" }),
        requirePostingAccount(tx, { companyId: actor.companyId, branchId: input.branchId, accountType: "INVENTORY" }),
      ]);
      const taxAccount = taxTotal.gt(0)
        ? await requirePostingAccount(tx, { companyId: actor.companyId, branchId: input.branchId, accountType: "TAX_PAYABLE" })
        : null;
      const netRevenue = subtotal.minus(discountTotal).toDecimalPlaces(4);

      const salesJournal = await postOperationalJournal(tx, {
        actor,
        branchId: input.branchId,
        postingDate: invoiceDate,
        preparedById: actor.userId,
        approvedById: actor.userId,
        documentType: "SALES_INVOICE_JOURNAL",
        voucherSuffix: "SV",
        sourceModule: "SALES",
        sourceDocumentType: "SalesInvoice",
        sourceDocumentId: invoice.id,
        sourceDocumentNumber: invoice.invoiceNumber,
        idempotencyKey: `POS-SI:${invoice.id}`,
        narration: `POS Counter Sale ${invoice.invoiceNumber} for ${customer.name}`,
        allowApproverPosting: true,
        lines: [
          {
            accountId: receivableAccount.id,
            description: `Customer receivable on ${invoice.invoiceNumber}`,
            debit: grandTotal,
            customerId: customer.id,
            salespersonId,
            invoiceNumber: invoice.invoiceNumber,
            dueDate: invoice.dueDate,
          },
          {
            accountId: revenueAccount.id,
            description: `Net counter sales on ${invoice.invoiceNumber}`,
            credit: netRevenue,
            customerId: customer.id,
            salespersonId,
            invoiceNumber: invoice.invoiceNumber,
            dueDate: invoice.dueDate,
          },
          ...(taxAccount
            ? [
                {
                  accountId: taxAccount.id,
                  description: `Output tax on ${invoice.invoiceNumber}`,
                  credit: taxTotal,
                  customerId: customer.id,
                  salespersonId,
                  invoiceNumber: invoice.invoiceNumber,
                  dueDate: invoice.dueDate,
                },
              ]
            : []),
          {
            accountId: cogsAccount.id,
            description: `Cost of goods sold on ${invoice.invoiceNumber}`,
            debit: totalCost,
            customerId: customer.id,
            salespersonId,
            invoiceNumber: invoice.invoiceNumber,
          },
          {
            accountId: inventoryAccount.id,
            description: `Inventory issued on ${invoice.invoiceNumber}`,
            credit: totalCost,
            customerId: customer.id,
            salespersonId,
            invoiceNumber: invoice.invoiceNumber,
          },
        ],
      });

      // 13. Apply Inventory Deductions & Update Handset Custody
      const movementGroupId = crypto.randomUUID();
      for (const line of invoice.lines) {
        const lineMeta = preparedLines.find((p) => p.lineNumber === line.lineNumber)!;
        const lineCost = lineCostMap.get(line.lineNumber)!;

        if (lineMeta.serialized) {
          for (const link of line.units) {
            const unit = await tx.physicalStockUnit.findUniqueOrThrow({ where: { id: link.stockUnitId } });
            await applyStockMovement(tx, {
              companyId: actor.companyId,
              branchId: input.branchId,
              warehouseId: input.warehouseId,
              productId: line.productId,
              variantId: line.variantId,
              stockUnitId: unit.id,
              journalEntryId: salesJournal.id,
              movementGroupId,
              idempotencyKey: `POS-MV:${invoice.id}:${line.id}:${unit.id}`,
              movementType: InventoryMovementType.SALE_ISSUE,
              postingDate: invoiceDate,
              quantity: "-1",
              unitCost: unit.acquisitionCost,
              sourceDocumentType: "SalesInvoice",
              sourceDocumentId: invoice.id,
              sourceDocumentNumber: invoice.invoiceNumber,
              lineReference: line.id,
              createdById: actor.userId,
            });
            await tx.physicalStockUnit.update({
              where: { id: unit.id },
              data: {
                status: StockUnitStatus.SOLD,
                currentBranchId: null,
                currentWarehouseId: null,
                currentLocationId: null,
                soldAt: new Date(),
                version: { increment: 1 },
              },
            });
          }
        } else {
          await applyStockMovement(tx, {
            companyId: actor.companyId,
            branchId: input.branchId,
            warehouseId: input.warehouseId,
            productId: line.productId,
            variantId: line.variantId,
            journalEntryId: salesJournal.id,
            movementGroupId,
            idempotencyKey: `POS-MV:${invoice.id}:${line.id}:QTY`,
            movementType: InventoryMovementType.SALE_ISSUE,
            postingDate: invoiceDate,
            quantity: line.quantity.negated(),
            unitCost: lineCost.unitCost,
            totalCost: lineCost.total.negated(),
            sourceDocumentType: "SalesInvoice",
            sourceDocumentId: invoice.id,
            sourceDocumentNumber: invoice.invoiceNumber,
            lineReference: line.id,
            createdById: actor.userId,
          });
        }
      }

      // 14. Transition Invoice to POSTED
      const postedInvoice = await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: {
          status: OperationalDocumentStatus.POSTED,
          journalEntryId: salesJournal.id,
          postedById: actor.userId,
          postedAt: new Date(),
        },
        include: {
          lines: {
            include: {
              units: { include: { stockUnit: { include: { identifiers: true } } } },
              product: true,
              variant: true,
            },
            orderBy: { lineNumber: "asc" },
          },
          customer: true,
          branch: true,
          warehouse: true,
        },
      });

      // 15. Create Customer Receipts & Payment Allocations for Tenders
      const createdPayments: any[] = [];
      for (const [tIndex, tender] of validTenders.entries()) {
        const tenderAmount = decimal(String(tender.amount));
        const isCash = tender.paymentMethod === "CASH";

        const { number: paymentNumber } = await allocateOperationalNumber(tx, {
          companyId: actor.companyId,
          branchId: input.branchId,
          postingDate: invoiceDate,
          documentType: "PAYMENT",
          suffix: "RC",
        });

        let settlementAccountId: string;
        let bankAccountId: string | null = null;
        let cashAccountId: string | null = null;

        if (isCash) {
          cashAccountId = tender.cashAccountId!;
          settlementAccountId = tender.cashAccountId!;
        } else {
          const bank = await tx.bankAccount.findUniqueOrThrow({ where: { id: tender.bankAccountId! } });
          bankAccountId = bank.id;
          settlementAccountId = bank.glAccountId;
        }

        // Post Customer Receipt GL Journal Voucher (RC)
        const paymentJournal = await postOperationalJournal(tx, {
          actor,
          branchId: input.branchId,
          postingDate: invoiceDate,
          preparedById: actor.userId,
          approvedById: actor.userId,
          documentType: "PAYMENT_JOURNAL",
          voucherSuffix: "RC",
          sourceModule: "PAYMENTS",
          sourceDocumentType: "Payment",
          sourceDocumentId: `temp-${tIndex}`,
          sourceDocumentNumber: paymentNumber,
          idempotencyKey: `POS-PMT:${invoice.id}:${tIndex}:${tender.paymentMethod}`,
          narration: `POS Counter Receipt ${paymentNumber} (${tender.paymentMethod}) for ${postedInvoice.invoiceNumber}`,
          referenceDocument: tender.reference || postedInvoice.invoiceNumber,
          allowApproverPosting: true,
          lines: [
            {
              accountId: settlementAccountId,
              description: `Counter settlement received (${tender.paymentMethod}) on ${paymentNumber}`,
              debit: tenderAmount,
              bankAccountId,
              customerId: customer.id,
              salespersonId,
              invoiceNumber: postedInvoice.invoiceNumber,
            },
            {
              accountId: receivableAccount.id,
              description: `Customer AR settlement on ${paymentNumber}`,
              credit: tenderAmount,
              customerId: customer.id,
              salespersonId,
              invoiceNumber: postedInvoice.invoiceNumber,
            },
          ],
        });

        // Create Payment record with POSTED status
        const payment = await tx.payment.create({
          data: {
            companyId: actor.companyId,
            branchId: input.branchId,
            customerId: customer.id,
            cashAccountId,
            bankAccountId,
            paymentNumber,
            paymentDate: invoiceDate,
            direction: PaymentDirection.CUSTOMER_RECEIPT,
            status: OperationalDocumentStatus.POSTED,
            currencyCode: input.currencyCode,
            amount: tenderAmount,
            reference: tender.reference || `POS ${tender.paymentMethod} ${postedInvoice.invoiceNumber}`,
            notes: tender.notes || `Counter checkout receipt for invoice ${postedInvoice.invoiceNumber}`,
            idempotencyKey: `pos-rc-${postedInvoice.id}-${tIndex}-${Date.now()}`,
            preparedById: actor.userId,
            postedById: actor.userId,
            postedAt: new Date(),
            journalEntryId: paymentJournal.id,
            terminalId: input.terminalId || null,
            shiftId: input.shiftId || null,
            allocations: {
              create: [
                {
                  salesInvoiceId: postedInvoice.id,
                  amount: tenderAmount,
                },
              ],
            },
          },
          include: { allocations: true },
        });

        // Patch journal with real payment ID
        await tx.journalEntry.update({
          where: { id: paymentJournal.id },
          data: { sourceDocumentId: payment.id },
        });

        createdPayments.push(payment);
      }

      // 16. Audit Log Entry
      await appendAudit({
        companyId: actor.companyId,
        actorId: actor.userId,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        action: "POS_SALE_COMPLETED",
        module: "sales",
        entityType: "SalesInvoice",
        entityId: postedInvoice.id,
        entityReference: postedInvoice.invoiceNumber,
        newValues: {
          grandTotal: moneyString(grandTotal),
          totalCost: moneyString(totalCost),
          tenderCount: validTenders.length,
          remainingCreditBalance: moneyString(remainingCreditBalance),
        },
        metadata: {
          movementGroupId,
          paymentIds: createdPayments.map((p) => p.id),
        },
      }, tx);

      const completePostedInvoice = await tx.salesInvoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: {
          lines: {
            include: {
              units: { include: { stockUnit: { include: { identifiers: true } } } },
              product: true,
              variant: true,
            },
            orderBy: { lineNumber: "asc" },
          },
          allocations: {
            include: {
              payment: {
                include: { cashAccount: true, bankAccount: true },
              },
            },
          },
          customer: true,
        },
      });

      return {
        invoice: completePostedInvoice,
        payments: createdPayments,
        remainingCreditBalance: moneyString(remainingCreditBalance),
        isDuplicate: false,
      };
    },
    {
      maxWait: 20_000,
      timeout: 60_000,
    },
  );
}

/**
 * Retrieves the active POS shift for a specific terminal or cashier.
 */
export async function getActivePosShift(
  companyId: string,
  terminalId?: string | null,
  cashierId?: string | null,
) {
  return prisma.posShift.findFirst({
    where: {
      companyId,
      status: "OPEN",
      ...(terminalId ? { terminalId } : {}),
      ...(cashierId ? { cashierId } : {}),
    },
    include: {
      terminal: true,
      cashier: { select: { id: true, fullName: true } },
    },
    orderBy: { openedAt: "desc" },
  });
}

/**
 * Opens a new POS shift and records the opening cash drawer float.
 */
export async function openPosShift(
  actor: OperationalActor,
  input: PosShiftOpenInput,
) {
  const terminal = await prisma.posTerminal.findFirst({
    where: { id: input.terminalId, companyId: actor.companyId, branchId: input.branchId, isActive: true },
  });
  if (!terminal) throw new ApiError(404, "TERMINAL_NOT_FOUND", "Selected POS terminal was not found.");

  // Check if this terminal or cashier already has an open shift
  const existingShift = await prisma.posShift.findFirst({
    where: {
      companyId: actor.companyId,
      status: "OPEN",
      OR: [{ terminalId: input.terminalId }, { cashierId: actor.userId }],
    },
  });
  if (existingShift) {
    throw new ApiError(409, "SHIFT_ALREADY_OPEN", "An open shift is already active on this terminal or for this cashier. Close the current shift before opening a new one.");
  }

  const openingFloat = decimal(String(input.openingFloat || 0));
  const shift = await prisma.posShift.create({
    data: {
      companyId: actor.companyId,
      branchId: input.branchId,
      terminalId: input.terminalId,
      cashierId: actor.userId,
      status: "OPEN",
      openingFloat,
      notes: input.notes || null,
    },
    include: {
      terminal: true,
      cashier: { select: { id: true, fullName: true } },
    },
  });

  await appendAudit({
    companyId: actor.companyId,
    actorId: actor.userId,
    branchId: input.branchId,
    action: "POS_SHIFT_OPENED",
    module: "pos",
    entityType: "PosShift",
    entityId: shift.id,
    entityReference: terminal.code,
    newValues: { openingFloat: moneyString(openingFloat) },
  });

  return shift;
}

/**
 * Closes an active POS shift:
 * Computes expected cash = openingFloat + postedCashReceipts - postedCashRefunds
 * Compares with closingActualCash and records cashDifference variance.
 */
export async function closePosShift(
  actor: OperationalActor,
  input: PosShiftCloseInput,
) {
  const shift = await prisma.posShift.findFirst({
    where: { id: input.shiftId, companyId: actor.companyId },
    include: { terminal: true },
  });
  if (!shift) throw new ApiError(404, "SHIFT_NOT_FOUND", "POS shift was not found.");
  if (shift.status === "CLOSED") {
    throw new ApiError(409, "SHIFT_ALREADY_CLOSED", "This POS shift has already been closed.");
  }

  // Calculate total cash transactions posted during this shift
  const cashPayments = await prisma.payment.findMany({
    where: {
      companyId: actor.companyId,
      shiftId: shift.id,
      status: OperationalDocumentStatus.POSTED,
      cashAccountId: { not: null },
    },
    select: { direction: true, amount: true },
  });

  let cashReceipts = zero();
  let cashRefunds = zero();
  for (const p of cashPayments) {
    if (p.direction === PaymentDirection.CUSTOMER_RECEIPT) {
      cashReceipts = cashReceipts.plus(p.amount);
    } else if (p.direction === PaymentDirection.CUSTOMER_REFUND) {
      cashRefunds = cashRefunds.plus(p.amount);
    }
  }

  const expectedCash = shift.openingFloat.plus(cashReceipts).minus(cashRefunds).toDecimalPlaces(4);
  const actualCash = decimal(String(input.closingActualCash || 0)).toDecimalPlaces(4);
  const variance = actualCash.minus(expectedCash).toDecimalPlaces(4);

  const updated = await prisma.posShift.update({
    where: { id: shift.id },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closingExpectedCash: expectedCash,
      closingActualCash: actualCash,
      cashDifference: variance,
      notes: input.notes || shift.notes,
    },
    include: {
      terminal: true,
      cashier: { select: { id: true, fullName: true } },
    },
  });

  await appendAudit({
    companyId: actor.companyId,
    actorId: actor.userId,
    branchId: shift.branchId,
    action: "POS_SHIFT_CLOSED",
    module: "pos",
    entityType: "PosShift",
    entityId: shift.id,
    entityReference: shift.terminal.code,
    newValues: {
      expectedCash: moneyString(expectedCash),
      actualCash: moneyString(actualCash),
      cashDifference: moneyString(variance),
    },
  });

  return updated;
}

