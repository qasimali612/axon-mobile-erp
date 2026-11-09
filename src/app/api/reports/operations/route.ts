import { NextResponse } from "next/server";
import { OperationalDocumentStatus, Prisma } from "@prisma/client";
import { ApiError, apiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { permittedDocumentScopes, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import {
  getStockByBrandReport,
  getStockByModelReport,
  getInventoryAgingReport,
  getStockLedgerReport,
  getNegativeStockExceptionReport,
} from "@/lib/reports/services/inventory-reports";
import {
  getCompleteImeiRegistryReport,
  getAvailableImeiReport,
  getSoldImeiReport,
  getDuplicateImeiAudit,
  getImeiReconciliationReport,
} from "@/lib/reports/services/imei-reports";
import {
  getSalesByBrandReport,
  getSalesByModelReport,
  getSalespersonPerformanceReport,
  getFastSlowMovingStockReport,
} from "@/lib/reports/services/sales-reports";
import {
  getSupplierPurchaseVolumeReport,
  getPurchasePriceTrendsReport,
} from "@/lib/reports/services/purchase-reports";

const reportPermissions: Record<string, string> = {
  // Operational Legacy Keys
  "purchase-orders": "report.purchase",
  "goods-receipts": "report.purchase",
  "purchase-returns": "report.purchase",
  sales: "report.sales",
  "sales-returns": "report.sales",
  inventory: "report.inventory",
  devices: "report.inventory",
  movements: "report.inventory",
  profitability: "report.profitability",
  reorder: "report.purchase",

  // Enterprise Reports — Inventory
  "stock-by-brand": "report.inventory",
  "stock-by-model": "report.inventory",
  "stock-aging": "report.inventory",
  "stock-ledger-rollforward": "report.inventory",
  "negative-stock-exceptions": "report.inventory",

  // Enterprise Reports — IMEI & Serialized
  "imei-master-registry": "report.inventory",
  "available-imei": "report.inventory",
  "sold-imei": "report.inventory",
  "duplicate-imei-exceptions": "report.inventory",
  "imei-reconciliation": "report.inventory",

  // Enterprise Reports — Sales
  "sales-by-brand": "report.sales",
  "sales-by-model": "report.sales",
  "salesperson-performance": "report.sales",
  "fast-moving-stock": "report.sales",
  "slow-moving-stock": "report.sales",

  // Enterprise Reports — Purchases
  "supplier-purchase-volume": "report.purchase",
  "purchase-price-trends": "report.purchase",
};

function parseDate(value: string | null, end = false) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new ApiError(422, "INVALID_DATE", "Report dates must use YYYY-MM-DD.");
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

type ReportRow = Record<string, unknown>;

function csvValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = typeof value === "object" && "toString" in value ? String(value) : String(value);
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${guarded.replaceAll('"', '""')}"`;
}

async function respond(request: Request, context: { company: { id: string }; user: { id: string } }, report: string, rows: ReportRow[], truncated: boolean) {
  const params = new URL(request.url).searchParams;
  if (params.get("format") !== "csv") return NextResponse.json(jsonSafe({ data: { report, rows, truncated } }));
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [
    ["report", report, "generated", new Date().toISOString()],
    columns,
    ...rows.map((row) => columns.map((column) => csvValue(row[column]))),
  ];
  const csv = `\uFEFF${lines.map((line) => line.map((value) => csvValue(String(value))).join(",")).join("\r\n")}`;
  await appendAudit({
    companyId: context.company.id,
    actorId: context.user.id,
    branchId: params.get("branchId") || null,
    warehouseId: params.get("warehouseId") || null,
    action: "OPERATIONAL_REPORT_EXPORTED",
    module: "reports",
    entityType: "OperationalReport",
    entityReference: report,
    metadata: { format: "CSV", rowCount: rows.length, from: params.get("from") || null, to: params.get("to") || null },
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const report = params.get("report") || "goods-receipts";
    const permission = reportPermissions[report];
    if (!permission) throw new ApiError(422, "INVALID_REPORT", `The requested report '${report}' is not supported.`);
    const context = await requirePermission(permission);
    const allowedScopes = permittedDocumentScopes(context, permission);
    const branchId = params.get("branchId") || undefined;
    const warehouseId = params.get("warehouseId") || undefined;
    const branchFilter = {
      ...(branchId ? { branchId } : {}),
      ...(allowedScopes ? { AND: [{ OR: allowedScopes }] } : {}),
    };
    const unitScopes = allowedScopes?.map((scope) => ({
      ...(scope.branchId ? { currentBranchId: scope.branchId } : {}),
      ...(scope.warehouseId ? { currentWarehouseId: scope.warehouseId } : {}),
    }));
    const productId = params.get("productId") || undefined;
    const brandId = params.get("brandId") || undefined;
    const customerId = params.get("customerId") || undefined;
    const supplierId = params.get("supplierId") || undefined;
    const salespersonId = params.get("salespersonId") || undefined;
    const statusValue = params.get("status");
    const status = statusValue && Object.values(OperationalDocumentStatus).includes(statusValue as OperationalDocumentStatus) ? statusValue as OperationalDocumentStatus : undefined;
    const from = parseDate(params.get("from"));
    const to = parseDate(params.get("to"), true);
    const dateRange = from || to ? { gte: from, lt: to } : undefined;
    const canViewCost = context.permissions.includes("catalog.cost.view") || context.permissions.includes("report.profitability") || context.permissions.includes("report.purchase");
    const take = Math.min(1000, Math.max(1, Number(params.get("limit") || 500)));

    // 1. Enterprise Services Dispatch
    if (report === "stock-by-brand") {
      const rows = await getStockByBrandReport({ companyId: context.company.id, branchFilter, warehouseId, brandId, canViewCost, take });
      return respond(request, context, report, rows as unknown as ReportRow[], rows.length === take);
    }
    if (report === "stock-by-model") {
      const rows = await getStockByModelReport({ companyId: context.company.id, branchFilter, warehouseId, brandId, productId, canViewCost, take });
      return respond(request, context, report, rows as unknown as ReportRow[], rows.length === take);
    }
    if (report === "stock-aging") {
      const rows = await getInventoryAgingReport({ companyId: context.company.id, branchFilter, warehouseId, brandId, canViewCost, take });
      return respond(request, context, report, rows as unknown as ReportRow[], rows.length === take);
    }
    if (report === "stock-ledger-rollforward") {
      const rows = await getStockLedgerReport({ companyId: context.company.id, branchFilter, warehouseId, productId, from, to, canViewCost, take });
      return respond(request, context, report, rows as unknown as ReportRow[], rows.length === take);
    }
    if (report === "negative-stock-exceptions") {
      const rows = await getNegativeStockExceptionReport({ companyId: context.company.id, branchFilter, warehouseId, canViewCost, take });
      return respond(request, context, report, rows as unknown as ReportRow[], rows.length === take);
    }

    if (report === "imei-master-registry") {
      const rows = await getCompleteImeiRegistryReport({ companyId: context.company.id, branchFilter, warehouseId, brandId, canViewCost, take });
      return respond(request, context, report, rows as unknown as ReportRow[], rows.length === take);
    }
    if (report === "available-imei") {
      const rows = await getAvailableImeiReport({ companyId: context.company.id, branchFilter, warehouseId, brandId, canViewCost, take });
      return respond(request, context, report, rows as unknown as ReportRow[], rows.length === take);
    }
    if (report === "sold-imei") {
      const rows = await getSoldImeiReport({ companyId: context.company.id, branchFilter, warehouseId, brandId, dateRange, canViewCost, take });
      return respond(request, context, report, rows as unknown as ReportRow[], rows.length === take);
    }
    if (report === "duplicate-imei-exceptions") {
      const rows = await getDuplicateImeiAudit(context.company.id);
      return respond(request, context, report, rows as unknown as ReportRow[], false);
    }
    if (report === "imei-reconciliation") {
      const rows = await getImeiReconciliationReport(context.company.id, warehouseId);
      return respond(request, context, report, rows as unknown as ReportRow[], false);
    }

    if (report === "sales-by-brand") {
      const rows = await getSalesByBrandReport({ companyId: context.company.id, branchFilter, warehouseId, brandId, customerId, salespersonId, dateRange, canViewCost, take });
      return respond(request, context, report, rows as unknown as ReportRow[], rows.length === take);
    }
    if (report === "sales-by-model") {
      const rows = await getSalesByModelReport({ companyId: context.company.id, branchFilter, warehouseId, brandId, customerId, salespersonId, dateRange, canViewCost, take });
      return respond(request, context, report, rows as unknown as ReportRow[], rows.length === take);
    }
    if (report === "salesperson-performance") {
      const rows = await getSalespersonPerformanceReport({ companyId: context.company.id, branchFilter, warehouseId, salespersonId, dateRange, canViewCost, take });
      return respond(request, context, report, rows as unknown as ReportRow[], rows.length === take);
    }
    if (report === "fast-moving-stock") {
      const rows = await getFastSlowMovingStockReport({ companyId: context.company.id, branchFilter, warehouseId, dateRange, canViewCost, take }, "FAST");
      return respond(request, context, report, rows as unknown as ReportRow[], rows.length === take);
    }
    if (report === "slow-moving-stock") {
      const rows = await getFastSlowMovingStockReport({ companyId: context.company.id, branchFilter, warehouseId, dateRange, canViewCost, take }, "SLOW");
      return respond(request, context, report, rows as unknown as ReportRow[], rows.length === take);
    }

    if (report === "supplier-purchase-volume") {
      const rows = await getSupplierPurchaseVolumeReport({ companyId: context.company.id, branchFilter, warehouseId, supplierId, brandId, dateRange, canViewCost, take });
      return respond(request, context, report, rows as unknown as ReportRow[], rows.length === take);
    }
    if (report === "purchase-price-trends") {
      const rows = await getPurchasePriceTrendsReport({ companyId: context.company.id, branchFilter, warehouseId, supplierId, brandId, dateRange, canViewCost, take });
      return respond(request, context, report, rows as unknown as ReportRow[], rows.length === take);
    }

    // 2. Legacy Operational Reports
    if (report === "purchase-orders") {
      const lines = await prisma.purchaseOrderLine.findMany({
        where: { order: { companyId: context.company.id, ...branchFilter, ...(warehouseId ? { warehouseId } : {}), ...(status ? { status } : {}), ...(dateRange ? { orderDate: dateRange } : {}) }, ...(productId ? { productId } : {}) },
        include: { order: { include: { branch: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } }, supplier: { select: { code: true, name: true } } } }, product: { select: { sku: true, name: true, trackingMethod: true, brand: { select: { name: true } } } }, variant: { select: { sku: true, name: true } } },
        orderBy: [{ order: { orderDate: "desc" } }, { order: { orderNumber: "desc" } }, { lineNumber: "asc" }], take,
      });
      const rows = lines.map((line) => ({ documentId: line.orderId, documentNumber: line.order.orderNumber, date: line.order.orderDate, status: line.order.status, branch: line.order.branch.code, warehouse: line.order.warehouse.code, partyCode: line.order.supplier.code, party: line.order.supplier.name, productId: line.productId, product: line.product.name, brand: line.product.brand?.name, variant: line.variant.name, sku: line.variant.sku, tracking: line.product.trackingMethod, orderedQuantity: line.orderedQuantity, receivedQuantity: line.receivedQuantity, outstandingQuantity: line.orderedQuantity.minus(line.receivedQuantity), unitCost: canViewCost ? line.unitCost : null, tax: canViewCost ? line.taxAmount : null, lineTotal: canViewCost ? line.lineTotal : null }));
      return respond(request, context, report, rows, rows.length === take);
    }

    if (report === "goods-receipts") {
      const lines = await prisma.purchaseReceiptLine.findMany({
        where: { receipt: { companyId: context.company.id, ...branchFilter, ...(warehouseId ? { warehouseId } : {}), ...(status ? { status } : {}), ...(dateRange ? { receiptDate: dateRange } : {}) }, ...(productId ? { productId } : {}) },
        include: { receipt: { include: { branch: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } }, supplier: { select: { code: true, name: true } } } }, product: { select: { sku: true, name: true, trackingMethod: true, brand: { select: { name: true } } } }, variant: { select: { sku: true, name: true } }, units: { select: { identifiers: true, inspectionStatus: true } } },
        orderBy: [{ receipt: { receiptDate: "desc" } }, { receipt: { receiptNumber: "desc" } }, { lineNumber: "asc" }], take,
      });
      const rows = lines.map((line) => ({ documentId: line.receiptId, documentNumber: line.receipt.receiptNumber, date: line.receipt.receiptDate, status: line.receipt.status, receiptType: line.receipt.receiptType, branch: line.receipt.branch.code, warehouse: line.receipt.warehouse.code, partyCode: line.receipt.supplier.code, party: line.receipt.supplier.name, productId: line.productId, product: line.product.name, brand: line.product.brand?.name, variant: line.variant.name, sku: line.variant.sku, tracking: line.product.trackingMethod, receivedQuantity: line.quantity, acceptedQuantity: line.acceptedQuantity, rejectedQuantity: line.rejectedQuantity, unitCost: canViewCost ? line.unitCost : null, landedUnitCost: canViewCost ? line.landedUnitCost : null, tax: canViewCost ? line.taxAmount : null, lineTotal: canViewCost ? line.lineTotal : null, physicalUnits: line.units.length, identifiers: line.units.flatMap((unit) => Array.isArray(unit.identifiers) ? (unit.identifiers as Array<{ value?: string }>).map((identifier) => identifier.value).filter(Boolean) : []).join(", ") }));
      return respond(request, context, report, rows, rows.length === take);
    }

    if (report === "purchase-returns" || report === "sales-returns") {
      const returnType = report === "sales-returns" ? "SALES_RETURN" : "PURCHASE_RETURN";
      const lines = await prisma.stockReturnLine.findMany({
        where: { stockReturn: { companyId: context.company.id, returnType, ...branchFilter, ...(warehouseId ? { warehouseId } : {}), ...(status ? { status } : {}), ...(dateRange ? { returnDate: dateRange } : {}) }, ...(productId ? { productId } : {}) },
        include: { stockReturn: { include: { branch: { select: { code: true } }, warehouse: { select: { code: true } }, customer: { select: { code: true, name: true } }, supplier: { select: { code: true, name: true } }, salesInvoice: { select: { invoiceNumber: true } }, purchaseReceipt: { select: { receiptNumber: true } } } }, product: { select: { name: true, trackingMethod: true, brand: { select: { name: true } } } }, variant: { select: { sku: true, name: true } }, units: { include: { stockUnit: { include: { identifiers: { select: { value: true } } } } } } },
        orderBy: [{ stockReturn: { returnDate: "desc" } }, { stockReturn: { returnNumber: "desc" } }, { lineNumber: "asc" }], take,
      });
      const rows = lines.map((line) => ({ documentId: line.returnId, documentNumber: line.stockReturn.returnNumber, sourceDocument: line.stockReturn.salesInvoice?.invoiceNumber || line.stockReturn.purchaseReceipt?.receiptNumber, date: line.stockReturn.returnDate, status: line.stockReturn.status, branch: line.stockReturn.branch.code, warehouse: line.stockReturn.warehouse.code, partyCode: line.stockReturn.customer?.code || line.stockReturn.supplier?.code, party: line.stockReturn.customer?.name || line.stockReturn.supplier?.name, productId: line.productId, product: line.product.name, brand: line.product.brand?.name, variant: line.variant.name, sku: line.variant.sku, tracking: line.product.trackingMethod, quantity: line.quantity, disposition: line.disposition, netValue: line.lineTotal.minus(line.taxAmount), tax: line.taxAmount, total: line.lineTotal, cost: canViewCost ? line.costTotal : null, identifiers: line.units.flatMap((unit) => unit.stockUnit.identifiers.map((identifier) => identifier.value)).join(", ") }));
      return respond(request, context, report, rows, rows.length === take);
    }

    if (report === "sales" || report === "profitability") {
      const lines = await prisma.salesInvoiceLine.findMany({
        where: { invoice: { companyId: context.company.id, ...branchFilter, ...(warehouseId ? { warehouseId } : {}), ...(status ? { status } : {}), ...(dateRange ? { invoiceDate: dateRange } : {}) }, ...(productId ? { productId } : {}) },
        include: { invoice: { include: { branch: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } }, customer: { select: { code: true, name: true } }, salesperson: { select: { fullName: true } } } }, product: { select: { sku: true, name: true, trackingMethod: true, brand: { select: { name: true } } } }, variant: { select: { sku: true, name: true } }, units: { include: { stockUnit: { include: { identifiers: { select: { value: true, type: true, slot: true } } } } } } },
        orderBy: [{ invoice: { invoiceDate: "desc" } }, { invoice: { invoiceNumber: "desc" } }, { lineNumber: "asc" }], take,
      });
      const rows = lines.map((line) => {
        const netRevenue = line.lineTotal.minus(line.taxAmount);
        const unitCostsSum = line.units.reduce(
          (sum, u) => sum.plus(u.stockUnit?.acquisitionCost ? new Prisma.Decimal(u.stockUnit.acquisitionCost) : new Prisma.Decimal(0)),
          new Prisma.Decimal(0),
        );
        const resolvedCost = line.costTotal.gt(0)
          ? line.costTotal
          : unitCostsSum.gt(0)
          ? unitCostsSum
          : line.costTotal;

        const isCostAllowed = canViewCost;
        const profit = netRevenue.minus(resolvedCost);
        const marginPercent =
          isCostAllowed && netRevenue.gt(0)
            ? profit.div(netRevenue).times(100).toDecimalPlaces(2)
            : null;

        return {
          documentId: line.invoiceId,
          documentNumber: line.invoice.invoiceNumber,
          date: line.invoice.invoiceDate,
          status: line.invoice.status,
          branch: line.invoice.branch.code,
          warehouse: line.invoice.warehouse.code,
          partyCode: line.invoice.customer.code,
          party: line.invoice.customer.name,
          salesperson: line.invoice.salesperson?.fullName,
          productId: line.productId,
          product: line.product.name,
          brand: line.product.brand?.name,
          variant: line.variant.name,
          sku: line.variant.sku,
          tracking: line.product.trackingMethod,
          quantity: line.quantity,
          netRevenue,
          tax: line.taxAmount,
          total: line.lineTotal,
          cost: isCostAllowed ? resolvedCost : null,
          grossProfit: isCostAllowed ? profit : null,
          marginPercent,
          identifiers: line.units.flatMap((unit) => unit.stockUnit.identifiers.map((identifier) => identifier.value)).join(", "),
        };
      });
      return respond(request, context, report, rows, rows.length === take);
    }

    if (report === "reorder") {
      const balances = await prisma.stockBalance.groupBy({
        by: ["variantId"],
        where: { companyId: context.company.id, ...(warehouseId ? { warehouseId } : {}) },
        _sum: { quantity: true },
      });
      const onHand = new Map(balances.map((row) => [row.variantId, row._sum.quantity ?? new Prisma.Decimal(0)]));
      const variants = await prisma.productVariant.findMany({
        where: { companyId: context.company.id, isActive: true, product: { status: "ACTIVE" } },
        include: {
          product: { select: { sku: true, name: true, trackingMethod: true, reorderLevel: true, maxStockLevel: true, preferredSupplier: { select: { id: true, code: true, name: true } }, brand: { select: { name: true } } } },
          supplierItems: { where: { isActive: true }, select: { supplierSku: true, lastCost: true, leadTimeDays: true, minOrderQty: true, supplier: { select: { code: true, name: true } } } },
        },
        orderBy: { sku: "asc" },
        take: 2000,
      });
      const rows = variants
        .map((variant) => {
          const quantity = onHand.get(variant.id) ?? new Prisma.Decimal(0);
          const reorderLevel = variant.product.reorderLevel;
          const maxLevel = variant.product.maxStockLevel;
          const target = maxLevel.gt(0) ? maxLevel : reorderLevel.times(2);
          const suggested = target.minus(quantity);
          const preferred = variant.product.preferredSupplier;
          const supplierItem = variant.supplierItems.find((item) => preferred && item.supplier.code === preferred.code) || variant.supplierItems[0];
          return {
            product: variant.product.name,
            brand: variant.product.brand?.name,
            variant: variant.name,
            sku: variant.sku,
            tracking: variant.product.trackingMethod,
            onHand: quantity,
            reorderLevel,
            maxStockLevel: maxLevel,
            shortfall: reorderLevel.minus(quantity),
            suggestedOrderQty: suggested.gt(0) ? suggested : new Prisma.Decimal(0),
            preferredSupplierCode: preferred?.code || supplierItem?.supplier.code,
            preferredSupplier: preferred?.name || supplierItem?.supplier.name,
            supplierSku: supplierItem?.supplierSku,
            lastCost: canViewCost ? supplierItem?.lastCost ?? null : null,
            leadTimeDays: supplierItem?.leadTimeDays ?? null,
            minOrderQty: supplierItem?.minOrderQty ?? null,
          };
        })
        .filter((row) => row.reorderLevel.gt(0) && row.onHand.lte(row.reorderLevel))
        .sort((left, right) => Number(right.shortfall.minus(left.shortfall)));
      const limited = rows.slice(0, take);
      return respond(request, context, report, limited, rows.length > limited.length);
    }

    if (report === "inventory") {
      const [balances, reservations] = await Promise.all([
        prisma.stockBalance.findMany({
          where: { companyId: context.company.id, ...branchFilter, ...(warehouseId ? { warehouseId } : {}), ...(productId ? { productId } : {}) },
          include: { branch: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } }, product: { select: { sku: true, name: true, trackingMethod: true, brand: { select: { name: true } } } }, variant: { select: { sku: true, name: true } }, lot: { select: { lotNumber: true, expiryDate: true } } }, orderBy: [{ product: { name: "asc" } }, { variant: { sku: "asc" } }], take,
        }),
        prisma.inventoryReservation.groupBy({ by: ["warehouseId", "productId", "variantId"], where: { companyId: context.company.id, ...branchFilter, ...(warehouseId ? { warehouseId } : {}), ...(productId ? { productId } : {}), releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, _sum: { quantity: true } }),
      ]);
      const reservationMap = new Map(reservations.map((reservation) => [`${reservation.warehouseId}:${reservation.productId}:${reservation.variantId}`, reservation._sum.quantity || new Prisma.Decimal(0)]));
      const rows = balances.map((balance) => { const reserved = reservationMap.get(`${balance.warehouseId}:${balance.productId}:${balance.variantId}`) || new Prisma.Decimal(0); return { branch: balance.branch.code, warehouse: balance.warehouse.code, productId: balance.productId, product: balance.product.name, brand: balance.product.brand?.name, variant: balance.variant.name, sku: balance.variant.sku, tracking: balance.product.trackingMethod, lot: balance.lot?.lotNumber, quantity: balance.quantity, reserved, available: balance.quantity.minus(reserved), inventoryValue: canViewCost ? balance.inventoryValue : null, averageCost: canViewCost && balance.quantity.gt(0) ? balance.inventoryValue.div(balance.quantity).toDecimalPlaces(4) : null }; });
      return respond(request, context, report, rows, rows.length === take);
    }

    if (report === "devices") {
      const units = await prisma.physicalStockUnit.findMany({
        where: { companyId: context.company.id, ...(branchId ? { currentBranchId: branchId } : {}), ...(warehouseId ? { currentWarehouseId: warehouseId } : {}), ...(productId ? { productId } : {}), ...(unitScopes ? { AND: [{ OR: unitScopes }] } : {}) },
        include: { currentBranch: { select: { code: true, name: true } }, currentWarehouse: { select: { code: true, name: true } }, product: { select: { sku: true, name: true, trackingMethod: true, brand: { select: { name: true } } } }, variant: { select: { sku: true, name: true } }, identifiers: { orderBy: [{ type: "asc" }, { slot: "asc" }] } }, orderBy: { createdAt: "desc" }, take,
      });
      const rows = units.map((unit) => ({ unitId: unit.id, status: unit.status, branch: unit.currentBranch?.code, warehouse: unit.currentWarehouse?.code, productId: unit.productId, product: unit.product.name, brand: unit.product.brand?.name, variant: unit.variant.name, sku: unit.variant.sku, tracking: unit.product.trackingMethod, identifiers: unit.identifiers.map((identifier) => `${identifier.type}${identifier.slot ? ` ${identifier.slot}` : ""}: ${identifier.value}`).join(" / "), acquisitionDate: unit.acquisitionDate, acquisitionCost: canViewCost ? unit.acquisitionCost : null, soldAt: unit.soldAt }));
      return respond(request, context, report, rows, rows.length === take);
    }

    const movementWhere: Prisma.InventoryMovementWhereInput = { companyId: context.company.id, ...branchFilter, ...(warehouseId ? { warehouseId } : {}), ...(productId ? { productId } : {}), ...(dateRange ? { postingDate: dateRange } : {}) };
    const movements = await prisma.inventoryMovement.findMany({ where: movementWhere, include: { branch: { select: { code: true } }, warehouse: { select: { code: true } }, product: { select: { name: true, trackingMethod: true } }, variant: { select: { sku: true, name: true } }, stockUnit: { include: { identifiers: { select: { value: true } } } } }, orderBy: [{ postingDate: "desc" }, { postedAt: "desc" }], take });
    const rows = movements.map((movement) => ({ movementId: movement.id, date: movement.postingDate, movementType: movement.movementType, documentId: movement.sourceDocumentId, documentNumber: movement.sourceDocumentNumber, sourceType: movement.sourceDocumentType, branch: movement.branch.code, warehouse: movement.warehouse.code, productId: movement.productId, product: movement.product.name, variant: movement.variant.name, sku: movement.variant.sku, tracking: movement.product.trackingMethod, quantity: movement.quantity, unitCost: canViewCost ? movement.unitCost : null, totalCost: canViewCost ? movement.totalCost : null, identifiers: movement.stockUnit?.identifiers.map((identifier) => identifier.value).join(", ") || "" }));
    return respond(request, context, report, rows, rows.length === take);
  } catch (error) { return apiError(error); }
}
