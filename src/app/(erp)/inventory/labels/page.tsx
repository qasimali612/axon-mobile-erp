import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BarcodeLabelStudio } from "@/components/inventory/barcode-label-studio";

export const metadata = {
  title: "Barcode & Label Studio · Axon ERP",
  description: "Generate & print retail price tags, EAN-13 barcodes, dual-IMEI box stickers, and thermal labels",
};

type PageProps = {
  searchParams: Promise<{ units?: string; warehouseId?: string; limit?: string }>;
};

/**
 * Universal Barcode & Label Studio
 * Supports product catalog retail tags, serialized dual-IMEI device stickers,
 * and on-the-fly custom Code128 / EAN-13 / QR codes for thermal rolls & A4 sheets.
 */
export default async function DeviceLabelsPage({ searchParams }: PageProps) {
  const context = await requirePagePermission("inventory.device.view");
  const params = await searchParams;
  const unitIds = (params.units || "").split(",").map((v) => v.trim()).filter(Boolean).slice(0, 120);
  const limit = Math.min(120, Math.max(1, Number(params.limit || 50)));

  // 1. Fetch active products with variants and barcodes
  const rawProducts = await prisma.product.findMany({
    where: {
      companyId: context.company.id,
      status: "ACTIVE",
    },
    select: {
      id: true,
      sku: true,
      name: true,
      model: true,
      trackingMethod: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
      barcodes: {
        select: {
          barcode: true,
          type: true,
          isPrimary: true,
        },
      },
      variants: {
        where: { isActive: true },
        select: {
          id: true,
          sku: true,
          name: true,
          color: true,
          ramGb: true,
          storageGb: true,
          retailPrice: true,
          wholesalePrice: true,
          barcodes: {
            select: {
              barcode: true,
              type: true,
              isPrimary: true,
            },
          },
        },
        orderBy: [{ storageGb: "asc" }, { name: "asc" }],
      },
    },
    orderBy: { name: "asc" },
  });

  const products = rawProducts.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    model: p.model,
    trackingMethod: p.trackingMethod,
    brand: p.brand,
    category: p.category,
    barcodes: p.barcodes,
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.name,
      color: v.color,
      ramGb: v.ramGb,
      storageGb: v.storageGb,
      retailPrice: v.retailPrice.toString(),
      wholesalePrice: v.wholesalePrice.toString(),
      barcodes: v.barcodes,
    })),
  }));

  // 2. Fetch physical stock units (for serialized IMEI stickers)
  const rawUnits = await prisma.physicalStockUnit.findMany({
    where: {
      companyId: context.company.id,
      ...(unitIds.length
        ? { id: { in: unitIds } }
        : {
            status: "IN_STOCK",
            ...(params.warehouseId ? { currentWarehouseId: params.warehouseId } : {}),
          }),
    },
    select: {
      id: true,
      product: {
        select: {
          name: true,
          sku: true,
          model: true,
          trackingMethod: true,
        },
      },
      variant: {
        select: {
          name: true,
          sku: true,
          color: true,
          ramGb: true,
          storageGb: true,
          retailPrice: true,
        },
      },
      identifiers: {
        select: {
          type: true,
          slot: true,
          value: true,
        },
        orderBy: [{ type: "asc" }, { slot: "asc" }],
      },
      currentWarehouse: {
        select: {
          code: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: unitIds.length ? unitIds.length : limit,
  });

  const initialUnits = rawUnits.map((u) => ({
    id: u.id,
    product: u.product,
    variant: {
      ...u.variant,
      retailPrice: u.variant.retailPrice.toString(),
    },
    identifiers: u.identifiers.map((i) => ({
      type: i.type,
      slot: i.slot ?? 1,
      value: i.value,
    })),
    currentWarehouse: u.currentWarehouse,
  }));

  return (
    <BarcodeLabelStudio
      products={products}
      initialUnits={initialUnits}
      companyName={context.company.name}
      currency={context.company.currencyCode || "PKR"}
    />
  );
}
