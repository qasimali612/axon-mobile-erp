import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type InventoryReportFilters = {
  companyId: string;
  branchFilter: Record<string, unknown>;
  warehouseId?: string;
  brandId?: string;
  model?: string;
  productId?: string;
  from?: Date;
  to?: Date;
  dateRange?: { gte?: Date; lt?: Date };
  canViewCost: boolean;
  take: number;
};

export async function getStockByBrandReport(filters: InventoryReportFilters) {
  const balances = await prisma.stockBalance.findMany({
    where: {
      companyId: filters.companyId,
      ...filters.branchFilter,
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.brandId ? { product: { brandId: filters.brandId } } : {}),
    },
    include: {
      product: { select: { brand: { select: { id: true, name: true } } } },
    },
  });

  const brandMap = new Map<
    string,
    { brand: string; variantCount: number; quantity: Prisma.Decimal; inventoryValue: Prisma.Decimal }
  >();

  for (const row of balances) {
    const brandName = row.product.brand?.name || "Unbranded / Generic";
    const existing = brandMap.get(brandName) || {
      brand: brandName,
      variantCount: 0,
      quantity: new Prisma.Decimal(0),
      inventoryValue: new Prisma.Decimal(0),
    };
    existing.variantCount += 1;
    existing.quantity = existing.quantity.plus(row.quantity);
    existing.inventoryValue = existing.inventoryValue.plus(row.inventoryValue);
    brandMap.set(brandName, existing);
  }

  const rows = [...brandMap.values()].map((item) => ({
    brand: item.brand,
    variantCount: item.variantCount,
    quantity: item.quantity,
    reserved: new Prisma.Decimal(0),
    available: item.quantity,
    inventoryValue: filters.canViewCost ? item.inventoryValue : null,
  })).sort((a, b) => Number(b.quantity.minus(a.quantity)));

  return rows.slice(0, filters.take);
}

export async function getStockByModelReport(filters: InventoryReportFilters) {
  const variants = await prisma.productVariant.findMany({
    where: {
      companyId: filters.companyId,
      isActive: true,
      ...(filters.brandId ? { product: { brandId: filters.brandId } } : {}),
      ...(filters.model ? { product: { model: { contains: filters.model, mode: "insensitive" } } } : {}),
    },
    include: {
      product: { select: { name: true, model: true, brand: { select: { name: true } } } },
      stockBalances: {
        where: {
          ...filters.branchFilter,
          ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
        },
        select: { quantity: true, inventoryValue: true },
      },
    },
    take: 1000,
  });

  const rows = variants
    .map((variant) => {
      const quantity = variant.stockBalances.reduce((sum, b) => sum.plus(b.quantity), new Prisma.Decimal(0));
      const value = variant.stockBalances.reduce((sum, b) => sum.plus(b.inventoryValue), new Prisma.Decimal(0));
      return {
        brand: variant.product.brand?.name || "—",
        model: variant.product.model || variant.product.name,
        variant: variant.name,
        storage: variant.storageGb ? `${variant.storageGb} GB` : "Standard",
        color: variant.color || "Standard",
        quantity,
        inventoryValue: filters.canViewCost ? value : null,
      };
    })
    .filter((row) => row.quantity.gt(0))
    .sort((a, b) => Number(b.quantity.minus(a.quantity)));

  return rows.slice(0, filters.take);
}

export async function getInventoryAgingReport(filters: InventoryReportFilters) {
  const units = await prisma.physicalStockUnit.findMany({
    where: {
      companyId: filters.companyId,
      status: "IN_STOCK",
      ...(filters.branchFilter ? filters.branchFilter : {}),
      ...(filters.warehouseId ? { currentWarehouseId: filters.warehouseId } : {}),
      ...(filters.brandId ? { product: { brandId: filters.brandId } } : {}),
    },
    include: {
      product: { select: { name: true, sku: true, brand: { select: { name: true } } } },
      variant: { select: { name: true, sku: true } },
    },
    take: 5000,
  });

  const now = new Date().getTime();
  const skuMap = new Map<
    string,
    {
      sku: string;
      product: string;
      totalQty: number;
      age0to30: number;
      age31to60: number;
      age61to90: number;
      age91to180: number;
      age180plus: number;
      inventoryValue: Prisma.Decimal;
    }
  >();

  for (const unit of units) {
    const sku = unit.variant.sku;
    const existing = skuMap.get(sku) || {
      sku,
      product: `${unit.product.name} (${unit.variant.name})`,
      totalQty: 0,
      age0to30: 0,
      age31to60: 0,
      age61to90: 0,
      age91to180: 0,
      age180plus: 0,
      inventoryValue: new Prisma.Decimal(0),
    };

    const days = Math.floor((now - new Date(unit.acquisitionDate).getTime()) / (1000 * 60 * 60 * 24));
    existing.totalQty += 1;
    existing.inventoryValue = existing.inventoryValue.plus(unit.acquisitionCost);

    if (days <= 30) existing.age0to30 += 1;
    else if (days <= 60) existing.age31to60 += 1;
    else if (days <= 90) existing.age61to90 += 1;
    else if (days <= 180) existing.age91to180 += 1;
    else existing.age180plus += 1;

    skuMap.set(sku, existing);
  }

  const rows = [...skuMap.values()].map((row) => ({
    ...row,
    inventoryValue: filters.canViewCost ? row.inventoryValue : null,
  })).sort((a, b) => b.totalQty - a.totalQty);

  return rows.slice(0, filters.take);
}

export async function getStockLedgerReport(filters: InventoryReportFilters) {
  const fromDate = filters.from || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const toDate = filters.to || new Date();

  // 1. Prior movements for opening quantity
  const priorMovements = await prisma.inventoryMovement.groupBy({
    by: ["variantId"],
    where: {
      companyId: filters.companyId,
      ...filters.branchFilter,
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      postingDate: { lt: fromDate },
    },
    _sum: { quantity: true },
  });

  // 2. Period movements
  const periodMovements = await prisma.inventoryMovement.findMany({
    where: {
      companyId: filters.companyId,
      ...filters.branchFilter,
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      postingDate: { gte: fromDate, lt: toDate },
    },
    include: {
      product: { select: { name: true, sku: true } },
      variant: { select: { name: true, sku: true } },
    },
    orderBy: { postingDate: "asc" },
  });

  const ledgerMap = new Map<
    string,
    {
      sku: string;
      product: string;
      openingQty: Prisma.Decimal;
      inwardQty: Prisma.Decimal;
      outwardQty: Prisma.Decimal;
      adjustedQty: Prisma.Decimal;
      unitCost: Prisma.Decimal;
    }
  >();

  for (const pm of priorMovements) {
    ledgerMap.set(pm.variantId, {
      sku: "",
      product: "",
      openingQty: pm._sum.quantity || new Prisma.Decimal(0),
      inwardQty: new Prisma.Decimal(0),
      outwardQty: new Prisma.Decimal(0),
      adjustedQty: new Prisma.Decimal(0),
      unitCost: new Prisma.Decimal(0),
    });
  }

  for (const mov of periodMovements) {
    const item = ledgerMap.get(mov.variantId) || {
      sku: mov.variant.sku,
      product: `${mov.product.name} · ${mov.variant.name}`,
      openingQty: new Prisma.Decimal(0),
      inwardQty: new Prisma.Decimal(0),
      outwardQty: new Prisma.Decimal(0),
      adjustedQty: new Prisma.Decimal(0),
      unitCost: mov.unitCost,
    };
    item.sku = mov.variant.sku;
    item.product = `${mov.product.name} · ${mov.variant.name}`;
    if (mov.unitCost.gt(0)) item.unitCost = mov.unitCost;

    if (["PURCHASE_RECEIPT", "CUSTOMER_RETURN", "TRANSFER_IN", "PRODUCTION_RECEIPT"].includes(mov.movementType)) {
      item.inwardQty = item.inwardQty.plus(mov.quantity);
    } else if (["SALES_DISPATCH", "SUPPLIER_RETURN", "TRANSFER_OUT", "PRODUCTION_ISSUE"].includes(mov.movementType)) {
      item.outwardQty = item.outwardQty.plus(mov.quantity.abs());
    } else {
      item.adjustedQty = item.adjustedQty.plus(mov.quantity);
    }
    ledgerMap.set(mov.variantId, item);
  }

  const rows = [...ledgerMap.values()]
    .map((item) => {
      const closingQty = item.openingQty.plus(item.inwardQty).minus(item.outwardQty).plus(item.adjustedQty);
      return {
        sku: item.sku,
        product: item.product,
        openingQty: item.openingQty,
        inwardQty: item.inwardQty,
        outwardQty: item.outwardQty,
        adjustedQty: item.adjustedQty,
        closingQty,
        averageCost: filters.canViewCost ? item.unitCost : null,
        closingValue: filters.canViewCost ? closingQty.times(item.unitCost).toDecimalPlaces(2) : null,
      };
    })
    .filter((r) => r.sku && (!r.closingQty.isZero() || !r.inwardQty.isZero() || !r.outwardQty.isZero()));

  return rows.slice(0, filters.take);
}

export async function getNegativeStockExceptionReport(filters: InventoryReportFilters) {
  const balances = await prisma.stockBalance.findMany({
    where: {
      companyId: filters.companyId,
      ...filters.branchFilter,
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      quantity: { lte: 0 },
    },
    include: {
      warehouse: { select: { code: true, name: true } },
      product: { select: { name: true, sku: true } },
      variant: { select: { name: true, sku: true } },
    },
    take: filters.take,
  });

  return balances.map((b) => ({
    warehouse: b.warehouse.code,
    sku: b.variant.sku,
    product: `${b.product.name} · ${b.variant.name}`,
    quantity: b.quantity,
    inventoryValue: filters.canViewCost ? b.inventoryValue : null,
  }));
}

