import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError } from "@/lib/api";
import { permittedDocumentScopes, requireAuth, type AuthContext, type OperationalDocumentScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

type SearchItem = { id: string; type: string; title: string; subtitle: string; href: string; badge?: string };
type SearchGroup = { type: string; label: string; items: SearchItem[] };

function has(context: AuthContext, permission: string) {
  return context.permissions.includes(permission);
}

function documentScopeRows(scopes: OperationalDocumentScope[] | null) {
  if (!scopes) return null;
  return scopes.map((scope) => ({ ...(scope.branchId ? { branchId: scope.branchId } : {}), ...(scope.warehouseId ? { warehouseId: scope.warehouseId } : {}) }));
}

function unitScope(scopes: OperationalDocumentScope[] | null): Prisma.PhysicalStockUnitWhereInput | null {
  if (!scopes) return null;
  return {
    OR: scopes.flatMap((scope) => [
      { ...(scope.branchId ? { currentBranchId: scope.branchId } : {}), ...(scope.warehouseId ? { currentWarehouseId: scope.warehouseId } : {}) },
      { movements: { some: { ...(scope.branchId ? { branchId: scope.branchId } : {}), ...(scope.warehouseId ? { warehouseId: scope.warehouseId } : {}) } } },
    ]),
  };
}

export async function GET(request: Request) {
  try {
    const context = await requireAuth();
    const query = new URL(request.url).searchParams.get("q")?.trim() || "";
    if (query.length < 2) throw new ApiError(422, "SEARCH_TOO_SHORT", "Enter at least two characters to search business records.");
    if (query.length > 120) throw new ApiError(422, "SEARCH_TOO_LONG", "Search text cannot exceed 120 characters.");
    const groups: SearchGroup[] = [];
    const normalized = query.replace(/[\s-]/g, "");

    if (has(context, "catalog.product.view")) {
      const products = await prisma.product.findMany({
        where: { companyId: context.company.id, status: "ACTIVE", OR: [{ sku: { contains: query, mode: "insensitive" } }, { name: { contains: query, mode: "insensitive" } }, { model: { contains: query, mode: "insensitive" } }, { modelCode: { contains: query, mode: "insensitive" } }, { variants: { some: { OR: [{ sku: { contains: query, mode: "insensitive" } }, { name: { contains: query, mode: "insensitive" } }] } } }, { barcodes: { some: { barcode: { contains: normalized, mode: "insensitive" } } } }] },
        include: { brand: { select: { name: true } }, variants: { take: 2, orderBy: { createdAt: "asc" } } },
        orderBy: { name: "asc" },
        take: 6,
      });
      if (products.length) groups.push({ type: "product", label: "Products and variants", items: products.map((product) => ({ id: product.id, type: "product", title: product.name, subtitle: `${product.sku} · ${product.brand?.name || "Unbranded"} · ${product.variants.map((variant) => variant.sku).join(", ")}`, href: `/catalog/products?search=${encodeURIComponent(query)}`, badge: product.trackingMethod })) });
    }

    if (has(context, "inventory.device.view")) {
      const scoped = unitScope(permittedDocumentScopes(context, "inventory.device.view"));
      const devices = await prisma.physicalStockUnit.findMany({
        where: { companyId: context.company.id, ...(scoped ? { AND: [scoped] } : {}), OR: [{ identifiers: { some: { normalizedValue: { contains: normalized, mode: "insensitive" } } } }, { product: { name: { contains: query, mode: "insensitive" } } }, { variant: { sku: { contains: query, mode: "insensitive" } } }] },
        include: { product: { select: { name: true } }, variant: { select: { sku: true, name: true } }, identifiers: { orderBy: [{ isPrimary: "desc" }, { slot: "asc" }] }, currentWarehouse: { select: { code: true } } },
        orderBy: { updatedAt: "desc" },
        take: 8,
      });
      if (devices.length) groups.push({ type: "device", label: "IMEI and serialized devices", items: devices.map((device) => ({ id: device.id, type: "device", title: device.identifiers.map((identifier) => identifier.value).join(" / "), subtitle: `${device.product.name} · ${device.variant.sku} · ${device.currentWarehouse?.code || "outside warehouse custody"}`, href: `/inventory/imei?search=${encodeURIComponent(device.identifiers[0]?.value || query)}&device=${device.id}`, badge: device.status === "IN_STOCK" ? "AVAILABLE" : device.status })) });
    }

    if (has(context, "inventory.transfer.view")) {
      const scopes = permittedDocumentScopes(context, "inventory.transfer.view");
      const scopedSides = scopes?.flatMap((scope) => [
        { ...(scope.branchId ? { sourceBranchId: scope.branchId } : {}), ...(scope.warehouseId ? { sourceWarehouseId: scope.warehouseId } : {}) },
        { ...(scope.branchId ? { destinationBranchId: scope.branchId } : {}), ...(scope.warehouseId ? { destinationWarehouseId: scope.warehouseId } : {}) },
      ]);
      const transfers = await prisma.stockTransfer.findMany({
        where: {
          companyId: context.company.id,
          ...(scopedSides ? { AND: [{ OR: scopedSides }] } : {}),
          OR: [
            { transferNumber: { contains: query, mode: "insensitive" } },
            { reference: { contains: query, mode: "insensitive" } },
            { reason: { contains: query, mode: "insensitive" } },
            { sourceWarehouse: { name: { contains: query, mode: "insensitive" } } },
            { destinationWarehouse: { name: { contains: query, mode: "insensitive" } } },
            { lines: { some: { OR: [
              { product: { name: { contains: query, mode: "insensitive" } } },
              { product: { sku: { contains: query, mode: "insensitive" } } },
              { variant: { sku: { contains: query, mode: "insensitive" } } },
              { units: { some: { stockUnit: { identifiers: { some: { normalizedValue: { contains: normalized, mode: "insensitive" } } } } } } },
            ] } } },
          ],
        },
        include: { sourceWarehouse: { select: { code: true } }, destinationWarehouse: { select: { code: true } } },
        orderBy: { createdAt: "desc" },
        take: 6,
      });
      if (transfers.length) groups.push({
        type: "stock-transfer",
        label: "Stock transfers",
        items: transfers.map((transfer) => ({
          id: transfer.id,
          type: "stock-transfer",
          title: transfer.transferNumber,
          subtitle: `${transfer.sourceWarehouse.code} → ${transfer.destinationWarehouse.code} · ${transfer.reason}`,
          href: `/inventory/transfers?transfer=${transfer.id}`,
          badge: transfer.status,
        })),
      });
    }

    if (has(context, "inventory.stock.view")) {
      const scopes = permittedDocumentScopes(context, "inventory.stock.view");
      const scopedRows = documentScopeRows(scopes);
      const [adjustments, counts] = await Promise.all([
        prisma.stockAdjustment.findMany({
          where: { companyId: context.company.id, ...(scopedRows ? { AND: [{ OR: scopedRows }] } : {}), OR: [
            { adjustmentNumber: { contains: query, mode: "insensitive" } },
            { reason: { contains: query, mode: "insensitive" } },
            { reasonCode: { contains: query, mode: "insensitive" } },
            { lines: { some: { OR: [
              { product: { name: { contains: query, mode: "insensitive" } } },
              { variant: { sku: { contains: query, mode: "insensitive" } } },
              { units: { some: { OR: [
                { stockUnit: { identifiers: { some: { normalizedValue: { contains: normalized, mode: "insensitive" } } } } },
                { identifiers: { some: { normalizedValue: { contains: normalized, mode: "insensitive" } } } },
              ] } } },
            ] } } },
          ] },
          include: { warehouse: { select: { code: true } } },
          orderBy: { createdAt: "desc" }, take: 5,
        }),
        prisma.stockCount.findMany({
          where: { companyId: context.company.id, ...(scopedRows ? { AND: [{ OR: scopedRows }] } : {}), OR: [
            { countNumber: { contains: query, mode: "insensitive" } },
            { reason: { contains: query, mode: "insensitive" } },
            { lines: { some: { OR: [{ product: { name: { contains: query, mode: "insensitive" } } }, { variant: { sku: { contains: query, mode: "insensitive" } } }] } } },
          ] },
          include: { warehouse: { select: { code: true } } },
          orderBy: { createdAt: "desc" }, take: 5,
        }),
      ]);
      if (adjustments.length) groups.push({ type: "stock-adjustment", label: "Stock adjustments", items: adjustments.map((item) => ({ id: item.id, type: "stock-adjustment", title: item.adjustmentNumber, subtitle: `${item.warehouse.code} · ${item.reasonCode} · ${item.reason}`, href: `/inventory/adjustments?adjustment=${item.id}`, badge: item.status })) });
      if (counts.length) groups.push({ type: "stock-count", label: "Physical stock counts", items: counts.map((item) => ({ id: item.id, type: "stock-count", title: item.countNumber, subtitle: `${item.warehouse.code} · ${item.scopeMode} · ${item.reason}`, href: `/inventory/stock-counts?count=${item.id}`, badge: item.status })) });
    }

    if (has(context, "purchase.view")) {
      const scopes = permittedDocumentScopes(context, "purchase.view");
      const scopedRows = documentScopeRows(scopes);
      const [orders, receipts] = await Promise.all([
        prisma.purchaseOrder.findMany({ where: { companyId: context.company.id, ...(scopedRows ? { AND: [{ OR: scopedRows }] } : {}), OR: [{ orderNumber: { contains: query, mode: "insensitive" } }, { supplierReference: { contains: query, mode: "insensitive" } }, { supplier: { name: { contains: query, mode: "insensitive" } } }] }, include: { supplier: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 5 }),
        prisma.purchaseReceipt.findMany({ where: { companyId: context.company.id, ...(scopedRows ? { AND: [{ OR: scopedRows }] } : {}), OR: [{ receiptNumber: { contains: query, mode: "insensitive" } }, { supplierInvoiceNumber: { contains: query, mode: "insensitive" } }, { supplierDeliveryNote: { contains: query, mode: "insensitive" } }, { supplier: { name: { contains: query, mode: "insensitive" } } }] }, include: { supplier: { select: { name: true } }, warehouse: { select: { code: true } } }, orderBy: { createdAt: "desc" }, take: 5 }),
      ]);
      const items: SearchItem[] = [
        ...orders.map((order) => ({ id: order.id, type: "purchase-order", title: order.orderNumber, subtitle: `${order.supplier.name} · ${order.currencyCode} ${order.grandTotal.toFixed(2)}`, href: "/purchases", badge: order.status })),
        ...receipts.map((receipt) => ({ id: receipt.id, type: "goods-receipt", title: receipt.receiptNumber, subtitle: `${receipt.supplier.name} · ${receipt.warehouse.code} · ${receipt.supplierInvoiceNumber || "no invoice reference"}`, href: `/goods-receipts/${receipt.id}`, badge: receipt.status })),
      ];
      if (items.length) groups.push({ type: "purchase", label: "Purchasing and goods receipts", items });
    }

    if (has(context, "sales.view")) {
      const scopes = permittedDocumentScopes(context, "sales.view");
      const scopedRows = documentScopeRows(scopes);
      const invoices = await prisma.salesInvoice.findMany({
        where: { companyId: context.company.id, ...(scopedRows ? { AND: [{ OR: scopedRows }] } : {}), OR: [{ invoiceNumber: { contains: query, mode: "insensitive" } }, { customer: { name: { contains: query, mode: "insensitive" } } }, { customer: { phone: { contains: query, mode: "insensitive" } } }, { lines: { some: { OR: [{ product: { name: { contains: query, mode: "insensitive" } } }, { variant: { sku: { contains: query, mode: "insensitive" } } }, { units: { some: { stockUnit: { identifiers: { some: { normalizedValue: { contains: normalized, mode: "insensitive" } } } } } } }] } } }] },
        include: { customer: { select: { name: true, phone: true } }, warehouse: { select: { code: true } } },
        orderBy: { createdAt: "desc" },
        take: 6,
      });
      if (invoices.length) groups.push({ type: "sale", label: "Sales invoices", items: invoices.map((invoice) => ({ id: invoice.id, type: "sales-invoice", title: invoice.invoiceNumber, subtitle: `${invoice.customer.name} · ${invoice.warehouse.code} · ${invoice.currencyCode} ${invoice.grandTotal.toFixed(2)}`, href: `/sales/${invoice.id}`, badge: invoice.status })) });
    }

    if (has(context, "customer.manage")) {
      const customers = await prisma.customer.findMany({ where: { companyId: context.company.id, status: "ACTIVE", OR: [{ code: { contains: query, mode: "insensitive" } }, { name: { contains: query, mode: "insensitive" } }, { phone: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] }, orderBy: { name: "asc" }, take: 5 });
      if (customers.length) groups.push({ type: "customer", label: "Customers", items: customers.map((customer) => ({ id: customer.id, type: "customer", title: customer.name, subtitle: `${customer.code} · ${customer.phone || customer.email || "no contact"}`, href: `/parties?tab=customers&search=${encodeURIComponent(query)}`, badge: customer.customerType })) });
    }

    if (has(context, "supplier.manage")) {
      const suppliers = await prisma.supplier.findMany({ where: { companyId: context.company.id, status: "ACTIVE", OR: [{ code: { contains: query, mode: "insensitive" } }, { name: { contains: query, mode: "insensitive" } }, { phone: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] }, orderBy: { name: "asc" }, take: 5 });
      if (suppliers.length) groups.push({ type: "supplier", label: "Suppliers", items: suppliers.map((supplier) => ({ id: supplier.id, type: "supplier", title: supplier.name, subtitle: `${supplier.code} · ${supplier.phone || supplier.email || "no contact"}`, href: `/parties?tab=suppliers&search=${encodeURIComponent(query)}`, badge: "SUPPLIER" })) });
    }

    return NextResponse.json(jsonSafe({ data: groups, meta: { query, total: groups.reduce((sum, group) => sum + group.items.length, 0) } }));
  } catch (error) {
    return apiError(error);
  }
}
