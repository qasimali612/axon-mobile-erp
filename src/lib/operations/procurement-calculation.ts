import "server-only";

import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { decimal, zero, type MoneyInput } from "@/lib/finance/money";

/**
 * Procurement amount policy (server authoritative):
 * - line tax is calculated on gross less the line discount;
 * - document discount is allocated pro-rata after line tax calculation;
 * - freight and other charges are allocated pro-rata into landed inventory cost;
 * - input tax is excluded from inventory value.
 *
 * The policy is deliberately isolated here so a future jurisdiction-specific
 * tax engine can replace it without changing PO, GRN, stock, or GL workflows.
 */
export type ProcurementCalculationLine = {
  quantity: MoneyInput;
  unitCost: MoneyInput;
  discountAmount: MoneyInput;
  taxRate: MoneyInput;
};

export type ProcurementDocumentCharges = {
  documentDiscount: MoneyInput;
  freightTotal: MoneyInput;
  otherCharges: MoneyInput;
};

function round(value: Prisma.Decimal) {
  return value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

function allocateProRata(total: Prisma.Decimal, bases: Prisma.Decimal[], baseTotal: Prisma.Decimal) {
  if (total.eq(0)) return bases.map(() => zero());
  if (baseTotal.lte(0)) {
    throw new ApiError(422, "INVALID_DOCUMENT_CHARGES", "Document-level amounts require a positive net goods value.");
  }
  let allocated = zero();
  return bases.map((base, index) => {
    if (index === bases.length - 1) return round(total.minus(allocated));
    const share = round(total.times(base).div(baseTotal));
    allocated = allocated.plus(share);
    return share;
  });
}

export function calculateProcurementDocument(
  lines: ProcurementCalculationLine[],
  charges: ProcurementDocumentCharges,
  options: { allowZeroQuantity?: boolean; label?: string } = {},
) {
  if (!lines.length) throw new ApiError(422, "EMPTY_DOCUMENT", "At least one product line is required.");
  const label = options.label || "Document";
  const firstPass = lines.map((line, index) => {
    const quantity = decimal(line.quantity);
    const unitCost = decimal(line.unitCost);
    const discountAmount = decimal(line.discountAmount);
    const taxRate = decimal(line.taxRate);
    if (quantity.lt(0) || (!options.allowZeroQuantity && quantity.eq(0))) {
      throw new ApiError(422, "INVALID_QUANTITY", `${label} line ${index + 1} quantity must be greater than zero.`);
    }
    if (unitCost.lt(0) || discountAmount.lt(0)) {
      throw new ApiError(422, "INVALID_AMOUNT", `${label} line ${index + 1} contains a negative amount.`);
    }
    if (taxRate.lt(0) || taxRate.gt(100)) {
      throw new ApiError(422, "INVALID_TAX_RATE", `${label} line ${index + 1} tax rate must be between 0 and 100.`);
    }
    const gross = round(quantity.times(unitCost));
    if (discountAmount.gt(gross)) {
      throw new ApiError(422, "INVALID_DISCOUNT", `${label} line ${index + 1} discount exceeds its gross amount.`);
    }
    const netBeforeTax = round(gross.minus(discountAmount));
    const taxAmount = round(netBeforeTax.times(taxRate).div(100));
    const lineTotal = round(netBeforeTax.plus(taxAmount));
    return { quantity, unitCost, discountAmount, taxRate, gross, netBeforeTax, taxAmount, lineTotal };
  });

  const documentDiscount = decimal(charges.documentDiscount);
  const freightTotal = decimal(charges.freightTotal);
  const otherCharges = decimal(charges.otherCharges);
  if (documentDiscount.lt(0) || freightTotal.lt(0) || otherCharges.lt(0)) {
    throw new ApiError(422, "INVALID_DOCUMENT_CHARGES", "Document discount, freight, and other charges cannot be negative.");
  }

  const subtotal = round(firstPass.reduce((total, line) => total.plus(line.gross), zero()));
  const discountTotal = round(firstPass.reduce((total, line) => total.plus(line.discountAmount), zero()));
  const netGoodsTotal = round(firstPass.reduce((total, line) => total.plus(line.netBeforeTax), zero()));
  if (documentDiscount.gt(netGoodsTotal)) {
    throw new ApiError(422, "INVALID_DOCUMENT_DISCOUNT", "Document discount exceeds the net goods amount.");
  }
  const taxTotal = round(firstPass.reduce((total, line) => total.plus(line.taxAmount), zero()));
  const grandTotal = round(netGoodsTotal.minus(documentDiscount).plus(taxTotal).plus(freightTotal).plus(otherCharges));
  const inventoryValue = round(netGoodsTotal.minus(documentDiscount).plus(freightTotal).plus(otherCharges));

  const bases = firstPass.map((line) => line.netBeforeTax);
  const allocatedDocumentDiscount = allocateProRata(documentDiscount, bases, netGoodsTotal);
  const allocatedFreight = allocateProRata(freightTotal, bases, netGoodsTotal);
  const allocatedOtherCharges = allocateProRata(otherCharges, bases, netGoodsTotal);
  const prepared = firstPass.map((line, index) => {
    const lineInventoryValue = round(
      line.netBeforeTax
        .minus(allocatedDocumentDiscount[index])
        .plus(allocatedFreight[index])
        .plus(allocatedOtherCharges[index]),
    );
    const landedUnitCost = line.quantity.gt(0) ? round(lineInventoryValue.div(line.quantity)) : zero();
    return {
      ...line,
      allocatedDocumentDiscount: allocatedDocumentDiscount[index],
      allocatedFreight: allocatedFreight[index],
      allocatedOtherCharges: allocatedOtherCharges[index],
      inventoryValue: lineInventoryValue,
      landedUnitCost,
    };
  });

  return {
    prepared,
    subtotal,
    discountTotal,
    documentDiscount,
    taxTotal,
    freightTotal,
    otherCharges,
    grandTotal,
    inventoryValue,
  };
}
