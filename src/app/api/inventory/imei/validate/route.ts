import { NextResponse } from "next/server";
import { IdentifierType, StockUnitStatus } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { isValidImei, normalizeImei } from "@/lib/imei";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

type DeviceInput = {
  unitIndex?: number;
  primary: string;
  secondary?: string | null;
  additional?: string | null;
};

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth();
    const body = await request.json();

    const mode: "purchase" | "sale" | "audit" = body.mode || "purchase";
    const warehouseId: string | null = body.warehouseId || null;
    const devices: DeviceInput[] = Array.isArray(body.devices) ? body.devices : [];

    if (!devices.length) {
      throw new ApiError(400, "EMPTY_PAYLOAD", "No device identifiers provided for validation.");
    }

    if (devices.length > 5000) {
      throw new ApiError(400, "PAYLOAD_TOO_LARGE", "Batch validation cannot exceed 5,000 devices at once.");
    }

    // Step 1: Format & Intra-Batch Duplication Validation
    const allNormalizedValues = new Set<string>();
    const seenMap = new Map<string, { deviceIndex: number; slot: string }>();
    const deviceResults: Array<{
      index: number;
      primary: string;
      secondary?: string | null;
      additional?: string | null;
      isValid: boolean;
      errors: string[];
      databaseMatch?: {
        stockUnitId: string;
        status: StockUnitStatus;
        productName: string;
        sku: string;
        warehouseCode?: string;
        warehouseName?: string;
        invoiceNumber?: string;
        receiptNumber?: string;
      } | null;
    }> = [];

    let totalIdentifiers = 0;
    let formatErrorsCount = 0;
    let duplicateErrorsCount = 0;

    for (let i = 0; i < devices.length; i++) {
      const dev = devices[i];
      const errors: string[] = [];
      const primaryTrim = (dev.primary || "").trim();
      const secondaryTrim = (dev.secondary || "").trim();
      const additionals = (dev.additional || "")
        .split(/[\s,;|]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const itemsInThisDevice: Array<{ value: string; norm: string; slot: string }> = [];

      if (!primaryTrim) {
        errors.push("Primary IMEI is missing.");
        formatErrorsCount++;
      } else {
        totalIdentifiers++;
        const norm1 = normalizeImei(primaryTrim);
        if (!isValidImei(norm1)) {
          errors.push(`Primary IMEI ${primaryTrim} is invalid (must be 15 digits satisfying Luhn checksum).`);
          formatErrorsCount++;
        } else {
          itemsInThisDevice.push({ value: primaryTrim, norm: norm1, slot: "SIM 1" });
        }
      }

      if (secondaryTrim) {
        totalIdentifiers++;
        const norm2 = normalizeImei(secondaryTrim);
        if (!isValidImei(norm2)) {
          errors.push(`Secondary IMEI ${secondaryTrim} is invalid (must be 15 digits satisfying Luhn checksum).`);
          formatErrorsCount++;
        } else {
          itemsInThisDevice.push({ value: secondaryTrim, norm: norm2, slot: "SIM 2" });
        }
      }

      for (let aIdx = 0; aIdx < additionals.length; aIdx++) {
        const addVal = additionals[aIdx];
        totalIdentifiers++;
        const normAdd = normalizeImei(addVal);
        if (!isValidImei(normAdd)) {
          errors.push(`Additional IMEI ${addVal} is invalid (must be 15 digits satisfying Luhn checksum).`);
          formatErrorsCount++;
        } else {
          itemsInThisDevice.push({ value: addVal, norm: normAdd, slot: `Additional ${aIdx + 1}` });
        }
      }

      // Check self-duplication on this device
      const thisDeviceNorms = new Set<string>();
      for (const item of itemsInThisDevice) {
        if (thisDeviceNorms.has(item.norm)) {
          errors.push(`Dual-SIM device cannot have identical IMEI for multiple slots (${item.value}).`);
          duplicateErrorsCount++;
        }
        thisDeviceNorms.add(item.norm);
      }

      // Check cross-device duplicate in this batch
      for (const item of itemsInThisDevice) {
        const seen = seenMap.get(item.norm);
        if (seen) {
          errors.push(`Duplicate IMEI ${item.value} already used on device #${seen.deviceIndex + 1} (${seen.slot}).`);
          duplicateErrorsCount++;
        } else {
          seenMap.set(item.norm, { deviceIndex: i, slot: item.slot });
          allNormalizedValues.add(item.norm);
        }
      }

      deviceResults.push({
        index: i,
        primary: dev.primary,
        secondary: dev.secondary,
        additional: dev.additional,
        isValid: errors.length === 0,
        errors,
        databaseMatch: null,
      });
    }

    // Step 2: Database Cross-Check against Company Inventory
    let dbDuplicatesCount = 0;
    let availabilityErrorsCount = 0;

    if (allNormalizedValues.size > 0) {
      const normalizedArray = Array.from(allNormalizedValues);
      const existingRecords = await prisma.deviceIdentifier.findMany({
        where: {
          companyId: auth.company.id,
          type: IdentifierType.IMEI,
          normalizedValue: { in: normalizedArray },
        },
        include: {
          stockUnit: {
            include: {
              product: { select: { name: true, sku: true } },
              variant: { select: { name: true, sku: true } },
              currentWarehouse: { select: { code: true, name: true } },
              salesUnits: {
                include: { invoiceLine: { include: { invoice: { select: { invoiceNumber: true } } } } },
                take: 1,
              },
              receiptUnits: {
                include: { receiptLine: { include: { receipt: { select: { receiptNumber: true } } } } },
                take: 1,
                orderBy: { createdAt: "desc" },
              },
            },
          },
        },
      });

      const dbMap = new Map<string, (typeof existingRecords)[0]>();
      for (const rec of existingRecords) {
        dbMap.set(rec.normalizedValue, rec);
      }

      // Evaluate per device based on mode
      for (const res of deviceResults) {
        const testedImeis = [res.primary, res.secondary, ...(res.additional ? res.additional.split(/[\s,;|]+/) : [])]
          .map((v) => (v || "").trim())
          .filter(Boolean)
          .map(normalizeImei);

        for (const norm of testedImeis) {
          const match = dbMap.get(norm);
          if (match) {
            const unit = match.stockUnit;
            res.databaseMatch = {
              stockUnitId: unit.id,
              status: unit.status,
              productName: unit.product.name,
              sku: unit.variant.sku,
              warehouseCode: unit.currentWarehouse?.code,
              warehouseName: unit.currentWarehouse?.name,
              invoiceNumber: unit.salesUnits?.[0]?.invoiceLine?.invoice?.invoiceNumber,
              receiptNumber: unit.receiptUnits?.[0]?.receiptLine?.receipt?.receiptNumber,
            };

            if (mode === "purchase") {
              // In purchase mode, any existing IMEI is a duplicate violation
              const whStr = unit.currentWarehouse ? `${unit.currentWarehouse.name} (${unit.currentWarehouse.code})` : "Outside warehouse";
              res.errors.push(
                `IMEI ${match.value} already exists in company inventory (${unit.product.name}, Status: ${unit.status}, Warehouse: ${whStr}). Duplicate purchase receipt prohibited.`
              );
              res.isValid = false;
              dbDuplicatesCount++;
            } else if (mode === "sale") {
              // In sale mode, device must be IN_STOCK and in target warehouse
              if (unit.status === StockUnitStatus.SOLD) {
                const inv = unit.salesUnits?.[0]?.invoiceLine?.invoice?.invoiceNumber ? ` on invoice ${unit.salesUnits[0].invoiceLine.invoice.invoiceNumber}` : "";
                res.errors.push(`Device with IMEI ${match.value} has already been sold${inv}. Duplicate sale prohibited.`);
                res.isValid = false;
                availabilityErrorsCount++;
              } else if (unit.status === StockUnitStatus.RESERVED) {
                res.errors.push(`Device with IMEI ${match.value} is currently reserved by another order.`);
                res.isValid = false;
                availabilityErrorsCount++;
              } else if (unit.status === StockUnitStatus.QUARANTINED) {
                res.errors.push(`Device with IMEI ${match.value} is quarantined / damaged.`);
                res.isValid = false;
                availabilityErrorsCount++;
              } else if (unit.status !== StockUnitStatus.IN_STOCK) {
                res.errors.push(`Device with IMEI ${match.value} is not available (status: ${unit.status}).`);
                res.isValid = false;
                availabilityErrorsCount++;
              } else if (warehouseId && unit.currentWarehouseId !== warehouseId) {
                res.errors.push(
                  `Device with IMEI ${match.value} is located in ${unit.currentWarehouse?.name || "another warehouse"}, not in selected dispatch warehouse.`
                );
                res.isValid = false;
                availabilityErrorsCount++;
              }
            }
          } else {
            // Not in DB
            if (mode === "sale") {
              res.errors.push(`Device with IMEI ${norm} was not found in company inventory.`);
              res.isValid = false;
              availabilityErrorsCount++;
            }
          }
        }
      }
    }

    const validDevicesCount = deviceResults.filter((r) => r.isValid).length;
    const invalidDevicesCount = deviceResults.length - validDevicesCount;

    return NextResponse.json(
      jsonSafe({
        valid: invalidDevicesCount === 0,
        summary: {
          totalDevices: devices.length,
          totalIdentifiers,
          validDevices: validDevicesCount,
          invalidDevices: invalidDevicesCount,
          formatErrors: formatErrorsCount,
          duplicateErrors: duplicateErrorsCount,
          dbDuplicates: dbDuplicatesCount,
          availabilityErrors: availabilityErrorsCount,
        },
        deviceResults,
      })
    );
  } catch (error) {
    return apiError(error);
  }
}
