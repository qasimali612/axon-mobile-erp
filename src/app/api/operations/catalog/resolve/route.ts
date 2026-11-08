import { NextResponse } from "next/server";
import { StockUnitStatus } from "@prisma/client";
import { apiError, ApiError } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

function normalizeIdentifier(value: string) {
  return value.trim().replace(/[\s-]+/g, "").toUpperCase();
}

export async function GET(request: Request) {
  try {
    const base = await requireAuth();
    const { searchParams } = new URL(request.url);
    const rawCode = searchParams.get("code")?.trim();
    if (!rawCode || rawCode.length > 120) throw new ApiError(422, "SCAN_CODE_REQUIRED", "Enter a barcode, SKU, serial number, or IMEI.");
    const mode = searchParams.get("mode") === "sale" ? "sale" : "purchase";
    const warehouseIdValue = searchParams.get("warehouseId");
    const warehouseId = warehouseIdValue ? idSchema.parse(warehouseIdValue) : null;
    const warehouse = warehouseId
      ? await prisma.warehouse.findFirst({ where: { id: warehouseId, companyId: base.company.id, isActive: true }, select: { id: true, branchId: true } })
      : null;
    if (warehouseId && !warehouse) throw new ApiError(404, "WAREHOUSE_NOT_FOUND", "The selected warehouse was not found.");
    const context = await requirePermission(mode === "sale" ? "sales.view" : "purchase.view", warehouse ? { branchId: warehouse.branchId, warehouseId: warehouse.id } : undefined);
    const normalized = normalizeIdentifier(rawCode);

    if (mode === "sale") {
      const identifier = await prisma.deviceIdentifier.findFirst({
        where: { companyId: context.company.id, normalizedValue: normalized },
        include: {
          stockUnit: {
            include: {
              product: { include: { brand: true, unit: true, taxRule: true } },
              variant: true,
              currentWarehouse: { select: { code: true, name: true } },
              identifiers: { orderBy: [{ type: "asc" }, { slot: "asc" }] },
              salesUnits: {
                include: { invoiceLine: { include: { invoice: { select: { invoiceNumber: true, invoiceDate: true, customer: { select: { name: true } } } } } } },
                take: 1,
              },
            },
          },
        },
      });
      if (identifier) {
        const unit = identifier.stockUnit;
        if (unit.status === StockUnitStatus.SOLD) {
          const lastSale = unit.salesUnits?.[0]?.invoiceLine?.invoice;
          const invoiceInfo = lastSale ? ` on invoice ${lastSale.invoiceNumber} (${lastSale.customer.name})` : "";
          throw new ApiError(409, "DEVICE_ALREADY_SOLD", `Device (IMEI: ${rawCode}) has already been sold${invoiceInfo}. Duplicate sale is prohibited.`);
        }
        if (unit.status === StockUnitStatus.RESERVED) {
          throw new ApiError(409, "DEVICE_RESERVED", `Device (IMEI: ${rawCode}) is reserved by another active order or transfer.`);
        }
        if (unit.status === StockUnitStatus.QUARANTINED) {
          throw new ApiError(409, "DEVICE_QUARANTINED", `Device (IMEI: ${rawCode}) is in quarantine/damaged stock and cannot be sold.`);
        }
        if (unit.status === StockUnitStatus.IN_TRANSIT) {
          throw new ApiError(409, "DEVICE_IN_TRANSIT", `Device (IMEI: ${rawCode}) is currently in transit between branches/warehouses.`);
        }
        if (warehouseId && unit.currentWarehouseId !== warehouseId) {
          const whName = unit.currentWarehouse ? `${unit.currentWarehouse.name} (${unit.currentWarehouse.code})` : "another warehouse";
          throw new ApiError(409, "DEVICE_WRONG_WAREHOUSE", `Device (IMEI: ${rawCode}) is located in ${whName}, not the selected dispatch warehouse.`);
        }
        if (unit.status !== StockUnitStatus.IN_STOCK) {
          throw new ApiError(409, "DEVICE_UNAVAILABLE", `Device (IMEI: ${rawCode}) is not available for sale (status: ${unit.status}).`);
        }

        const reservation = await prisma.inventoryReservation.findFirst({ where: { companyId: context.company.id, stockUnitId: identifier.stockUnit.id, releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { id: true } });
        if (reservation) throw new ApiError(409, "DEVICE_RESERVED", "This device is reserved by another active workflow.");
        return NextResponse.json(jsonSafe({ data: {
          resolutionType: "DEVICE_IDENTIFIER",
          matchedCode: rawCode,
          stockUnit: {
            id: identifier.stockUnit.id,
            status: identifier.stockUnit.status,
            warehouseId: identifier.stockUnit.currentWarehouseId,
            acquisitionCost: context.permissions.includes("catalog.cost.view") ? identifier.stockUnit.acquisitionCost : undefined,
            identifiers: identifier.stockUnit.identifiers,
          },
          product: identifier.stockUnit.product,
          variant: identifier.stockUnit.variant,
          availableQuantity: "1.0000",
        } }));
      }
    }

    if (mode === "purchase") {
      const existing = await prisma.deviceIdentifier.findFirst({
        where: { companyId: context.company.id, normalizedValue: normalized },
        include: {
          stockUnit: {
            include: {
              product: { select: { name: true, sku: true } },
              variant: { select: { name: true, sku: true } },
              currentWarehouse: { select: { name: true, code: true } },
            },
          },
        },
      });
      if (existing) {
        const u = existing.stockUnit;
        const wh = u.currentWarehouse ? `${u.currentWarehouse.name} (${u.currentWarehouse.code})` : "Outside warehouse";
        throw new ApiError(
          409,
          "IMEI_ALREADY_EXISTS",
          `Duplicate IMEI: ${rawCode} is already registered in company inventory (${u.product.name} · ${u.variant.name}, Status: ${u.status}, Warehouse: ${wh}). Receiving the same IMEI again is prohibited.`,
        );
      }
    }

    const barcode = await prisma.productBarcode.findFirst({
      where: { companyId: context.company.id, barcode: rawCode },
      include: {
        product: { include: { brand: true, unit: true, taxRule: true } },
        variant: true,
      },
    });
    let product = barcode?.product ?? null;
    let variant = barcode?.variant ?? null;
    const resolutionType = barcode ? "BARCODE" : "SKU";
    if (!product) {
      const skuVariant = await prisma.productVariant.findFirst({
        where: { companyId: context.company.id, isActive: true, sku: { equals: rawCode, mode: "insensitive" }, product: { status: "ACTIVE" } },
        include: { product: { include: { brand: true, unit: true, taxRule: true } } },
      });
      if (skuVariant) {
        product = skuVariant.product;
        variant = skuVariant;
      } else {
        const skuProduct = await prisma.product.findFirst({
          where: { companyId: context.company.id, status: "ACTIVE", sku: { equals: rawCode, mode: "insensitive" } },
          include: { brand: true, unit: true, taxRule: true, variants: { where: { isActive: true }, orderBy: { sku: "asc" }, take: 2 } },
        });
        if (skuProduct) {
          product = skuProduct;
          variant = skuProduct.variants.length === 1 ? skuProduct.variants[0] : null;
        }
      }
    }
    if (!product) throw new ApiError(404, "CATALOG_CODE_NOT_FOUND", "No active product matches this barcode or SKU. Nothing was created.");
    if (!variant) throw new ApiError(409, "VARIANT_SELECTION_REQUIRED", "The product has multiple variants; select one before adding it.");

    const [balance, reservation] = warehouseId ? await Promise.all([
      prisma.stockBalance.aggregate({ where: { companyId: context.company.id, warehouseId, productId: product.id, variantId: variant.id }, _sum: { quantity: true } }),
      mode === "sale" ? prisma.inventoryReservation.aggregate({ where: { companyId: context.company.id, warehouseId, productId: product.id, variantId: variant.id, stockUnitId: null, releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, _sum: { quantity: true } }) : Promise.resolve(null),
    ]) : [null, null];
    const availableQuantity = balance?._sum.quantity?.minus(reservation?._sum.quantity || 0) ?? "0";
    return NextResponse.json(jsonSafe({ data: {
      resolutionType,
      matchedCode: rawCode,
      product,
      variant,
      availableQuantity,
    } }));
  } catch (error) {
    return apiError(error);
  }
}
