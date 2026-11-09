import "server-only";

import { Prisma, StockUnitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeImei, isValidImei } from "@/lib/imei";

export type StockEligibilityFilter = {
  companyId: string;
  variantIds?: string[];
  supplierId?: string | null;
  warehouseId?: string | null;
  branchId?: string | null;
  purchaseFrom?: string | null;
  purchaseTo?: string | null;
};

export type EligibleUnitDetail = {
  stockUnitId: string;
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  brandName: string;
  sku: string;
  imei1: string | null;
  imei2: string | null;
  serialNumber: string | null;
  acquisitionCost: number;
  acquisitionDate: string;
  warehouseId: string | null;
  warehouseName: string;
  branchId: string | null;
  branchName: string;
  receiptNumber: string | null;
  receiptDate: string | null;
  supplierId: string | null;
  supplierName: string | null;
  isEligible: boolean;
  exclusionReason?: string;
};

export type VariantEligibilitySummary = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  brandName: string;
  sku: string;
  purchasePrice: number;
  physicalStock: number;
  previouslyClaimedQuantity: number;
  eligibleQuantity: number;
  isSerialized: boolean;
  units: EligibleUnitDetail[];
};

/**
 * Extracts all already claimed stock unit IDs and quantities from active or settled rebate calculations.
 * Prevents double-claiming the same inventory unit across multiple rebate claims.
 */
export async function getClaimedStockUnitIds(companyId: string, excludeCalculationId?: string): Promise<Set<string>> {
  const calculations = await prisma.rebateCalculation.findMany({
    where: {
      companyId,
      status: { notIn: ["REJECTED"] },
      ...(excludeCalculationId ? { id: { not: excludeCalculationId } } : {}),
    },
    select: { id: true, calculationDetails: true },
  });

  const claimedIds = new Set<string>();
  for (const calc of calculations) {
    const details = calc.calculationDetails as Record<string, any> | null;
    if (!details || !Array.isArray(details.items)) continue;
    for (const item of details.items) {
      if (Array.isArray(item.claimedUnitIds)) {
        for (const id of item.claimedUnitIds) {
          if (typeof id === "string") claimedIds.add(id);
        }
      }
      if (Array.isArray(item.imeis)) {
        for (const imeiRecord of item.imeis) {
          if (imeiRecord?.stockUnitId) claimedIds.add(imeiRecord.stockUnitId);
        }
      }
    }
  }
  return claimedIds;
}

/**
 * Core Old-Stock Eligibility Engine
 * Automatically scans on-hand stock and verifies eligibility against:
 * 1. Physical Stock Unit status = IN_STOCK
 * 2. Purchase date / Goods receipt date range
 * 3. Specific Supplier / Manufacturer
 * 4. Deduplicated dual-SIM IMEIs (1 physical handset = 1 unit)
 * 5. Exclusion of already claimed stock units (zero double-claiming)
 */
export async function evaluateStockEligibility(
  filter: StockEligibilityFilter
): Promise<VariantEligibilitySummary[]> {
  const { companyId, variantIds, supplierId, warehouseId, branchId, purchaseFrom, purchaseTo } = filter;

  const claimedUnitIds = await getClaimedStockUnitIds(companyId);

  const purchaseStartDate = purchaseFrom ? new Date(`${purchaseFrom}T00:00:00.000Z`) : null;
  const purchaseEndDate = purchaseTo ? new Date(`${purchaseTo}T23:59:59.999Z`) : null;

  // 1. Fetch targeted product variants
  const variants = await prisma.productVariant.findMany({
    where: {
      companyId,
      isActive: true,
      ...(variantIds && variantIds.length > 0 ? { id: { in: variantIds } } : {}),
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          brand: { select: { name: true } },
        },
      },
      stockBalances: {
        where: {
          ...(warehouseId ? { warehouseId } : {}),
        },
        select: {
          warehouseId: true,
          quantity: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  if (variants.length === 0) return [];

  const targetVariantIds = variants.map((v) => v.id);

  // 2. Fetch serialized physical stock units (1 handset = 1 PhysicalStockUnit)
  const physicalUnits = await prisma.physicalStockUnit.findMany({
    where: {
      companyId,
      variantId: { in: targetVariantIds },
      status: StockUnitStatus.IN_STOCK,
      ...(warehouseId ? { currentWarehouseId: warehouseId } : {}),
      ...(branchId ? { currentBranchId: branchId } : {}),
    },
    include: {
      identifiers: {
        select: {
          type: true,
          value: true,
          slot: true,
          isPrimary: true,
        },
      },
      currentWarehouse: { select: { id: true, name: true } },
      currentBranch: { select: { id: true, name: true } },
      receiptUnits: {
        take: 1,
        orderBy: { createdAt: "desc" },
        include: {
          receiptLine: {
            include: {
              receipt: {
                select: {
                  receiptNumber: true,
                  receiptDate: true,
                  supplierId: true,
                  supplier: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  // Map physical units by variantId
  const unitsByVariant = new Map<string, EligibleUnitDetail[]>();

  for (const unit of physicalUnits) {
    const receiptLine = unit.receiptUnits[0]?.receiptLine;
    const receipt = receiptLine?.receipt;

    // Check supplier match
    if (supplierId && receipt && receipt.supplierId !== supplierId) {
      continue;
    }

    // Check purchase date range match
    const receiptDate = receipt ? new Date(receipt.receiptDate) : new Date(unit.acquisitionDate);
    if (purchaseStartDate && receiptDate < purchaseStartDate) {
      continue;
    }
    if (purchaseEndDate && receiptDate > purchaseEndDate) {
      continue;
    }

    // Deduplicate IMEI 1 and IMEI 2
    let imei1: string | null = null;
    let imei2: string | null = null;
    let serialNumber: string | null = null;

    for (const ident of unit.identifiers) {
      if (ident.type === "IMEI") {
        if (ident.slot === 1 || (ident.isPrimary && !imei1)) {
          imei1 = ident.value;
        } else if (ident.slot === 2 || (!imei2 && imei1 && ident.value !== imei1)) {
          imei2 = ident.value;
        } else if (!imei1) {
          imei1 = ident.value;
        }
      } else if (ident.type === "SERIAL") {
        serialNumber = ident.value;
      }
    }

    const isAlreadyClaimed = claimedUnitIds.has(unit.id);

    const detail: EligibleUnitDetail = {
      stockUnitId: unit.id,
      variantId: unit.variantId,
      productId: unit.productId,
      productName: "", // filled below
      variantName: "",
      brandName: "",
      sku: "",
      imei1,
      imei2,
      serialNumber,
      acquisitionCost: Number(unit.acquisitionCost),
      acquisitionDate: unit.acquisitionDate.toISOString().slice(0, 10),
      warehouseId: unit.currentWarehouseId,
      warehouseName: unit.currentWarehouse?.name ?? "Main Warehouse",
      branchId: unit.currentBranchId,
      branchName: unit.currentBranch?.name ?? "Main Branch",
      receiptNumber: receipt?.receiptNumber ?? null,
      receiptDate: receipt ? receipt.receiptDate.toISOString().slice(0, 10) : unit.acquisitionDate.toISOString().slice(0, 10),
      supplierId: receipt?.supplierId ?? null,
      supplierName: receipt?.supplier?.name ?? null,
      isEligible: !isAlreadyClaimed,
      exclusionReason: isAlreadyClaimed ? "Unit already claimed in previous rebate claim" : undefined,
    };

    if (!unitsByVariant.has(unit.variantId)) {
      unitsByVariant.set(unit.variantId, []);
    }
    unitsByVariant.get(unit.variantId)!.push(detail);
  }

  // 3. Assemble summaries for each variant
  const result: VariantEligibilitySummary[] = [];

  for (const v of variants) {
    const units = unitsByVariant.get(v.id) || [];
    const isSerialized = units.length > 0;

    // Fill metadata on units
    for (const u of units) {
      u.productName = v.product?.name ?? v.name;
      u.variantName = v.name;
      u.brandName = v.product?.brand?.name ?? "";
      u.sku = v.sku;
    }

    const physicalStock = isSerialized
      ? units.length
      : Math.max(0, v.stockBalances.reduce((sum, b) => sum + Number(b.quantity), 0));

    const eligibleUnits = units.filter((u) => u.isEligible);
    const previouslyClaimedQuantity = isSerialized
      ? units.filter((u) => !u.isEligible).length
      : 0;

    const eligibleQuantity = isSerialized
      ? eligibleUnits.length
      : physicalStock;

    result.push({
      variantId: v.id,
      productId: v.productId,
      productName: v.product?.name ?? v.name,
      variantName: v.name,
      brandName: v.product?.brand?.name ?? "",
      sku: v.sku,
      purchasePrice: Number(v.purchasePrice),
      physicalStock,
      previouslyClaimedQuantity,
      eligibleQuantity,
      isSerialized,
      units,
    });
  }

  return result;
}

/**
 * Customer / Dealer Rebate Given Eligibility
 * Identifies eligible sales invoices where price-protection compensation applies.
 * Ensures no duplicate credit notes for the same invoice, item, or unit.
 */
export async function evaluateCustomerRebateEligibility(params: {
  companyId: string;
  customerId: string;
  variantIds?: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
}) {
  const { companyId, customerId, variantIds, dateFrom, dateTo } = params;

  const startDate = dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`) : null;
  const endDate = dateTo ? new Date(`${dateTo}T23:59:59.999Z`) : null;

  // Find already credited sales invoices / items
  const existingPayableCalculations = await prisma.rebateCalculation.findMany({
    where: {
      companyId,
      customerId,
      status: { notIn: ["REJECTED"] },
      program: { direction: "PAYABLE" },
    },
    select: { calculationDetails: true },
  });

  const creditedInvoiceIds = new Set<string>();
  const creditedStockUnitIds = new Set<string>();

  for (const calc of existingPayableCalculations) {
    const details = calc.calculationDetails as Record<string, any> | null;
    if (!details || !Array.isArray(details.items)) continue;
    for (const item of details.items) {
      if (item.salesInvoiceId) creditedInvoiceIds.add(item.salesInvoiceId);
      if (Array.isArray(item.claimedUnitIds)) {
        for (const id of item.claimedUnitIds) creditedStockUnitIds.add(id);
      }
    }
  }

  const invoices = await prisma.salesInvoice.findMany({
    where: {
      companyId,
      customerId,
      status: "POSTED",
      ...(startDate || endDate
        ? {
            invoiceDate: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    },
    include: {
      customer: { select: { id: true, name: true, code: true } },
      lines: {
        where: {
          ...(variantIds && variantIds.length > 0 ? { variantId: { in: variantIds } } : {}),
        },
        include: {
          variant: {
            select: {
              id: true,
              sku: true,
              name: true,
              product: { select: { name: true, brand: { select: { name: true } } } },
            },
          },
          units: {
            include: {
              stockUnit: {
                include: {
                  identifiers: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { invoiceDate: "desc" },
    take: 200,
  });

  return invoices.map((inv) => {
    const isAlreadyCredited = creditedInvoiceIds.has(inv.id);
    const eligibleLines = inv.lines.map((line) => ({
      lineId: line.id,
      variantId: line.variantId,
      sku: line.variant.sku,
      productName: line.variant.product?.name ?? line.variant.name,
      variantName: line.variant.name,
      brandName: line.variant.product?.brand?.name ?? "",
      soldQuantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      lineTotal: Number(line.lineTotal),
    }));

    const eligibleUnits: Array<{ unitId: string; stockUnitId: string; imei1: string | null; imei2: string | null; isCredited: boolean }> = [];
    for (const line of inv.lines) {
      for (const u of line.units) {
        let imei1: string | null = null;
        let imei2: string | null = null;
        if (u.stockUnit?.identifiers) {
          for (const ident of u.stockUnit.identifiers) {
            if (ident.type === "IMEI") {
              if (ident.slot === 1 || !imei1) imei1 = ident.value;
              else if (ident.slot === 2 || !imei2) imei2 = ident.value;
            }
          }
        }
        eligibleUnits.push({
          unitId: u.id,
          stockUnitId: u.stockUnitId,
          imei1,
          imei2,
          isCredited: u.stockUnitId ? creditedStockUnitIds.has(u.stockUnitId) : false,
        });
      }
    }

    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate.toISOString().slice(0, 10),
      customerId: inv.customerId,
      customerName: inv.customer.name,
      customerCode: inv.customer.code,
      totalAmount: Number(inv.grandTotal),
      lines: eligibleLines,
      units: eligibleUnits,
      isAlreadyCredited,
    };
  });
}
