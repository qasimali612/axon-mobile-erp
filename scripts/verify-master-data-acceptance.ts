import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.OPERATIONS_TEST_BASE_URL || "http://127.0.0.1:3000";
const run = Date.now().toString(36).toUpperCase();
const sessionIds: string[] = [];
const cleanupIds = new Set<string>();
const locationIds: string[] = [];
const categoryIds: string[] = [];
const brandIds: string[] = [];
const unitIds: string[] = [];
const variantIds: string[] = [];
let movedUnit: { id: string; locationId: string | null } | null = null;
let foreignCompanyId: string | null = null;
type Session = { cookie: string; userAgent: string };

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function login(email: string, companyId: string, branchId: string, warehouseId: string): Promise<Session> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("base64url");
  const userAgent = `Axon-Master-Acceptance/${run}/${email}`;
  const row = await prisma.session.create({ data: { tokenHash: createHash("sha256").update(token).digest("hex"), userId: user.id, activeCompanyId: companyId, activeBranchId: branchId, activeWarehouseId: warehouseId, ipAddress: "127.0.0.1", userAgent, expiresAt: new Date(Date.now() + 3_600_000) } });
  sessionIds.push(row.id); return { cookie: `axon_session=${token}`, userAgent };
}
async function request(session: Session, path: string, options: { method?: string; body?: unknown; expected?: number | number[] } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method: options.method || "GET", headers: { Cookie: session.cookie, Origin: baseUrl, "User-Agent": session.userAgent, ...(options.body === undefined ? {} : { "content-type": "application/json" }) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const text = await response.text(); const body = text && response.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text;
  const expected = Array.isArray(options.expected ?? 200) ? options.expected as number[] : [options.expected ?? 200];
  if (!expected.includes(response.status)) throw new Error(`${options.method || "GET"} ${path}: expected ${expected.join("/")}, got ${response.status}: ${text}`);
  return body;
}
const categoryBody = (code: string, name: string, parentId: string | null = null, isActive = true) => ({ code, name, parentId, description: `Acceptance ${run}`, isActive });
const brandBody = (code: string, name: string, isActive = true) => ({ code, name, logoUrl: "", isActive });
const unitBody = (code: string, name: string, decimalPlaces = 0, isActive = true) => ({ code, name, decimalPlaces, isActive });
const locationBody = (code: string, name: string, type: "ZONE" | "RACK" | "SHELF" | "BIN", parentId: string | null, barcode: string, isActive = true) => ({ code, name, type, parentId, barcode, sequence: 90, isQuarantine: false, isActive });
async function setUnitLocation(id: string, currentLocationId: string | null) { await prisma.$transaction(async (tx) => { await tx.$queryRaw`SELECT set_config('app.inventory_posting', 'on', true)`; await tx.physicalStockUnit.update({ where: { id }, data: { currentLocationId } }); }); }

async function main() {
  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR-MAIN" } } });
  const owner = await login("owner@axonmobile.local", company.id, warehouse.branchId, warehouse.id);
  const buyer = await login("buyer@axonmobile.local", company.id, warehouse.branchId, warehouse.id);

  await request(buyer, "/api/catalog/masters?type=brand", { method: "POST", body: brandBody(`DENY-${run}`, `Denied ${run}`), expected: 403 });
  await request(buyer, `/api/warehouses/${warehouse.id}/locations`, { method: "POST", body: locationBody(`D-${run}`, `Denied ${run}`, "ZONE", null, `DENY-${run}`), expected: 403 });
  console.log("✓ catalog and location mutations reject a user without master-data permissions");

  const parent = await request(owner, "/api/catalog/masters?type=category", { method: "POST", body: categoryBody(`CP-${run}`, `Acceptance parent ${run}`), expected: 201 }); categoryIds.push(parent.data.id); cleanupIds.add(parent.data.id);
  const child = await request(owner, "/api/catalog/masters?type=category", { method: "POST", body: categoryBody(`CC-${run}`, `Acceptance child ${run}`, parent.data.id), expected: 201 }); categoryIds.push(child.data.id); cleanupIds.add(child.data.id);
  await request(owner, "/api/catalog/masters?type=category", { method: "POST", body: categoryBody(`CP-${run}`, `Duplicate parent ${run}`), expected: 409 });
  await request(owner, `/api/catalog/masters/category/${parent.data.id}`, { method: "PATCH", body: categoryBody(`CP-${run}`, `Acceptance parent ${run}`, child.data.id), expected: 422 });
  await request(owner, `/api/catalog/masters/category/${parent.data.id}`, { method: "PATCH", body: categoryBody(`CP-${run}`, `Acceptance parent ${run}`, null, false), expected: 409 });
  await request(owner, `/api/catalog/masters/category/${child.data.id}`, { method: "PATCH", body: categoryBody(`CC-${run}`, `Acceptance child revised ${run}`, parent.data.id) });

  const brand = await request(owner, "/api/catalog/masters?type=brand", { method: "POST", body: brandBody(`BR-${run}`, `Acceptance brand ${run}`), expected: 201 }); brandIds.push(brand.data.id); cleanupIds.add(brand.data.id);
  await request(owner, `/api/catalog/masters/brand/${brand.data.id}`, { method: "PATCH", body: brandBody(`BR-${run}`, `Acceptance brand revised ${run}`) });
  const unit = await request(owner, "/api/catalog/masters?type=unit", { method: "POST", body: unitBody(`U-${run}`, `Acceptance unit ${run}`), expected: 201 }); unitIds.push(unit.data.id); cleanupIds.add(unit.data.id);
  await request(owner, `/api/catalog/masters/unit/${unit.data.id}`, { method: "PATCH", body: unitBody(`U-${run}`, `Acceptance unit revised ${run}`, 3) });

  const categories = await request(owner, "/api/catalog/masters?type=category");
  const usedCategory = categories.data.find((item: { _count: { products: number } }) => item._count.products > 0);
  assert(usedCategory, "No in-use category was available for protection acceptance.");
  await request(owner, `/api/catalog/masters/category/${usedCategory.id}`, { method: "PATCH", body: { code: usedCategory.code, name: usedCategory.name, parentId: usedCategory.parentId, description: usedCategory.description, isActive: false }, expected: 409 });
  const units = await request(owner, "/api/catalog/masters?type=unit"); const usedUnit = units.data.find((item: { _count: { products: number } }) => item._count.products > 0); assert(usedUnit, "No in-use unit was available.");
  await request(owner, `/api/catalog/masters/unit/${usedUnit.id}`, { method: "PATCH", body: { code: usedUnit.code, name: usedUnit.name, decimalPlaces: usedUnit.decimalPlaces, isActive: false }, expected: 409 });

  const foreign = await prisma.company.create({ data: { code: `F${run}`.slice(0, 20), name: `Foreign acceptance ${run}` } }); foreignCompanyId = foreign.id;
  const foreignCategory = await prisma.productCategory.create({ data: { companyId: foreign.id, code: `FC-${run}`.slice(0, 30), name: `Foreign category ${run}` } });
  await request(owner, `/api/catalog/masters/category/${foreignCategory.id}`, { method: "PATCH", body: categoryBody(`FC-${run}`, `Foreign category ${run}`), expected: 404 });
  console.log("✓ category hierarchy, duplicate, in-use, unit-precision, company-scope, and CRUD controls passed");

  const z = await request(owner, `/api/warehouses/${warehouse.id}/locations`, { method: "POST", body: locationBody(`Z-${run}`, `Zone ${run}`, "ZONE", null, `LZ-${run}`), expected: 201 }); locationIds.push(z.data.id); cleanupIds.add(z.data.id);
  await request(owner, `/api/warehouses/${warehouse.id}/locations`, { method: "POST", body: locationBody(`ZD-${run}`, `Duplicate ${run}`, "ZONE", null, `LZ-${run}`), expected: 409 });
  await request(owner, `/api/warehouses/${warehouse.id}/locations`, { method: "POST", body: locationBody(`RX-${run}`, `Invalid rack ${run}`, "RACK", null, `LRX-${run}`), expected: 422 });
  const r = await request(owner, `/api/warehouses/${warehouse.id}/locations`, { method: "POST", body: locationBody(`R-${run}`, `Rack ${run}`, "RACK", z.data.id, `LR-${run}`), expected: 201 }); locationIds.push(r.data.id); cleanupIds.add(r.data.id);
  const s = await request(owner, `/api/warehouses/${warehouse.id}/locations`, { method: "POST", body: locationBody(`S-${run}`, `Shelf ${run}`, "SHELF", r.data.id, `LS-${run}`), expected: 201 }); locationIds.push(s.data.id); cleanupIds.add(s.data.id);
  const b = await request(owner, `/api/warehouses/${warehouse.id}/locations`, { method: "POST", body: locationBody(`B-${run}`, `Bin ${run}`, "BIN", s.data.id, `LB-${run}`), expected: 201 }); locationIds.push(b.data.id); cleanupIds.add(b.data.id);
  await request(owner, `/api/warehouses/${warehouse.id}/locations/${z.data.id}`, { method: "PATCH", body: locationBody(`Z-${run}`, `Zone ${run}`, "ZONE", null, `LZ-${run}`, false), expected: 409 });
  await request(owner, `/api/warehouses/${warehouse.id}/locations/${r.data.id}`, { method: "PATCH", body: locationBody(`R-${run}`, `Rack ${run}`, "RACK", r.data.id, `LR-${run}`), expected: 422 });
  await request(owner, `/api/warehouses/${randomUUID()}/locations`, { expected: 404 });

  const stockUnit = await prisma.physicalStockUnit.findFirst({ where: { companyId: company.id, currentWarehouseId: warehouse.id, status: "IN_STOCK" }, select: { id: true, currentLocationId: true } });
  assert(stockUnit, "No in-stock serialized unit was available for location stock protection acceptance."); movedUnit = { id: stockUnit.id, locationId: stockUnit.currentLocationId };
  await setUnitLocation(stockUnit.id, b.data.id);
  await request(owner, `/api/warehouses/${warehouse.id}/locations/${b.data.id}`, { method: "PATCH", body: locationBody(`B-${run}`, `Bin ${run}`, "BIN", s.data.id, `LB-${run}`, false), expected: 409 });
  await setUnitLocation(stockUnit.id, stockUnit.currentLocationId); movedUnit = null;
  await request(owner, `/api/warehouses/${warehouse.id}/locations/${b.data.id}`, { method: "PATCH", body: locationBody(`B-${run}`, `Bin revised ${run}`, "BIN", s.data.id, `LB-${run}`) });
  console.log("✓ zone → rack → shelf → bin hierarchy, barcode uniqueness, scope, child and live-stock protections passed");

  const stocked = await prisma.physicalStockUnit.findFirst({ where: { companyId: company.id, status: { in: ["IN_STOCK", "RESERVED", "IN_TRANSIT", "QUARANTINED"] } }, include: { product: { include: { variants: { orderBy: { createdAt: "asc" } }, barcodes: true } }, variant: true } });
  assert(stocked, "No stocked product was available for variant safeguards.");
  const newVariantPayload = { sku: `V-${run}`, name: `Acceptance variant ${run}`, color: "Test blue", ramGb: 12, storageGb: 256, networkType: "5G", simConfiguration: "DUAL", regionVariant: "PK", purchasePrice: "100.0000", wholesalePrice: "120.0000", retailPrice: "150.0000", minimumSellingPrice: "110.0000", isActive: true, barcodes: [{ barcode: `VB1-${run}`, type: "CODE128", isPrimary: true }, { barcode: `VB2-${run}`, type: "CODE128", isPrimary: false }] };
  await request(buyer, `/api/products/${stocked.productId}/variants`, { method: "POST", body: newVariantPayload, expected: 403 });
  const variant = await request(owner, `/api/products/${stocked.productId}/variants`, { method: "POST", body: newVariantPayload, expected: 201 }); variantIds.push(variant.data.id); cleanupIds.add(variant.data.id);
  await request(owner, `/api/products/${stocked.productId}/variants`, { method: "POST", body: { ...newVariantPayload, sku: `VD-${run}`, barcodes: [{ barcode: `VB1-${run}`, type: "CODE128", isPrimary: true }] }, expected: 409 });
  const stockedBarcodes = stocked.product.barcodes.filter((item) => item.variantId === stocked.variantId).map((item) => ({ barcode: item.barcode, type: item.type, isPrimary: item.isPrimary }));
  await request(owner, `/api/products/${stocked.productId}/variants/${stocked.variantId}`, { method: "PATCH", body: { sku: stocked.variant.sku, name: stocked.variant.name, color: stocked.variant.color || "", ramGb: stocked.variant.ramGb, storageGb: stocked.variant.storageGb, networkType: stocked.variant.networkType || "", simConfiguration: stocked.variant.simConfiguration || "", regionVariant: stocked.variant.regionVariant || "", purchasePrice: stocked.variant.purchasePrice.toString(), wholesalePrice: stocked.variant.wholesalePrice.toString(), retailPrice: stocked.variant.retailPrice.toString(), minimumSellingPrice: stocked.variant.minimumSellingPrice.toString(), isActive: false, barcodes: stockedBarcodes }, expected: 409 });
  await request(owner, `/api/products/${stocked.productId}/variants/${variant.data.id}`, { method: "PATCH", body: { ...newVariantPayload, name: `Acceptance variant revised ${run}`, retailPrice: "155.0000", barcodes: [{ barcode: `VB3-${run}`, type: "CODE128", isPrimary: true }] } });

  const product = await request(owner, `/api/products/${stocked.productId}`); const primary = product.data.variants[0];
  await request(owner, `/api/products/${stocked.productId}`, { method: "PUT", body: { sku: product.data.sku, name: product.data.name, model: product.data.model || "", modelCode: product.data.modelCode || "", categoryId: product.data.categoryId, brandId: product.data.brandId || "", unitId: product.data.unitId, productType: product.data.productType, trackingMethod: product.data.trackingMethod, costingMethod: product.data.costingMethod === "SPECIFIC" ? "FIFO" : "SPECIFIC", standardPurchasePrice: product.data.standardPurchasePrice, reorderLevel: product.data.reorderLevel, variant: { sku: primary.sku, name: primary.name, color: primary.color || "", ramGb: primary.ramGb, storageGb: primary.storageGb, networkType: primary.networkType || "", simConfiguration: primary.simConfiguration || "", regionVariant: primary.regionVariant || "", purchasePrice: primary.purchasePrice, wholesalePrice: primary.wholesalePrice, retailPrice: primary.retailPrice, minimumSellingPrice: primary.minimumSellingPrice, barcode: product.data.barcodes.find((item: { variantId: string; isPrimary: boolean }) => item.variantId === primary.id && item.isPrimary)?.barcode || "" } }, expected: 409 });
  console.log("✓ multi-variant/barcode CRUD, duplicate, permission, stocked deactivation, and immutable policy-history guards passed");

  const auditCount = await prisma.auditLog.count({ where: { companyId: company.id, entityId: { in: [...cleanupIds] }, action: { in: ["CATALOG_CATEGORY_CREATED", "CATALOG_BRAND_CREATED", "CATALOG_UNIT_CREATED", "WAREHOUSE_LOCATION_CREATED", "WAREHOUSE_LOCATION_UPDATED", "PRODUCT_VARIANT_CREATED", "PRODUCT_VARIANT_UPDATED"] } } });
  assert(auditCount >= 10, `Expected master-data audit coverage, found ${auditCount} matching records.`);
  const catalogPage = await request(owner, "/catalog/masters"); assert(String(catalogPage).includes("Catalog masters"), "Catalog master workspace did not render.");
  const locationPage = await request(owner, "/organization/locations"); assert(String(locationPage).includes("Warehouse locations"), "Warehouse location workspace did not render.");
  console.log(`✓ audit evidence and authenticated master-data workspaces rendered (${run})`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (movedUnit) await setUnitLocation(movedUnit.id, movedUnit.locationId).catch(() => undefined);
  if (sessionIds.length) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => undefined);
  if (cleanupIds.size) await prisma.auditLog.deleteMany({ where: { entityId: { in: [...cleanupIds] } } }).catch(() => undefined);
  for (const id of [...variantIds].reverse()) { await prisma.productBarcode.deleteMany({ where: { variantId: id } }).catch(() => undefined); await prisma.productVariant.delete({ where: { id } }).catch(() => undefined); }
  for (const id of [...locationIds].reverse()) await prisma.warehouseLocation.delete({ where: { id } }).catch(() => undefined);
  for (const id of [...categoryIds].reverse()) await prisma.productCategory.delete({ where: { id } }).catch(() => undefined);
  for (const id of brandIds) await prisma.brand.delete({ where: { id } }).catch(() => undefined);
  for (const id of unitIds) await prisma.unitOfMeasure.delete({ where: { id } }).catch(() => undefined);
  if (foreignCompanyId) { await prisma.productCategory.deleteMany({ where: { companyId: foreignCompanyId } }).catch(() => undefined); await prisma.company.delete({ where: { id: foreignCompanyId } }).catch(() => undefined); }
  await prisma.$disconnect();
});
