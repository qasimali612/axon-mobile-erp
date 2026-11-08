import { describe, expect, it } from "vitest";
import {
  stockAdjustmentDraftSchema,
  stockCountCreateSchema,
  stockCountRecordSchema,
  stockTransferDraftSchema,
} from "@/lib/operations/validation";

const sourceBranchId = "11111111-1111-4111-8111-111111111111";
const sourceWarehouseId = "22222222-2222-4222-8222-222222222222";
const destinationBranchId = "33333333-3333-4333-8333-333333333333";
const destinationWarehouseId = "44444444-4444-4444-8444-444444444444";
const productId = "55555555-5555-4555-8555-555555555555";
const variantId = "66666666-6666-4666-8666-666666666666";
const stockUnitId = "77777777-7777-4777-8777-777777777777";

function payload() {
  return {
    sourceBranchId,
    sourceWarehouseId,
    destinationBranchId,
    destinationWarehouseId,
    transferDate: "2026-10-28",
    reason: "Branch replenishment",
    idempotencyKey: "transfer-validation-test",
    lines: [
      { productId, variantId, quantity: "2.5000", stockUnitIds: [] },
      { productId, variantId: stockUnitId, quantity: "1", stockUnitIds: [stockUnitId] },
    ],
  };
}

describe("stockTransferDraftSchema", () => {
  it("accepts normalized multi-line quantity and physical-unit input", () => {
    const result = stockTransferDraftSchema.parse(payload());
    expect(result.lines).toHaveLength(2);
    expect(result.lines[1].stockUnitIds).toEqual([stockUnitId]);
  });

  it("rejects a transfer to the same warehouse", () => {
    const value = payload();
    value.destinationWarehouseId = sourceWarehouseId;
    expect(stockTransferDraftSchema.safeParse(value).success).toBe(false);
  });

  it("rejects zero or negative quantity", () => {
    const value = payload();
    value.lines[0].quantity = "0";
    expect(stockTransferDraftSchema.safeParse(value).success).toBe(false);
  });
});

describe("stockAdjustmentDraftSchema", () => {
  const adjustment = () => ({
    branchId: sourceBranchId,
    warehouseId: sourceWarehouseId,
    adjustmentDate: "2026-10-28",
    reasonCode: "cycle correction",
    reason: "Controlled mixed stock correction",
    idempotencyKey: "adjustment-validation-test",
    lines: [
      { productId, variantId, quantityDelta: "2.5000", unitCost: "12.50", stockUnitIds: [], units: [] },
      { productId, variantId: stockUnitId, quantityDelta: "-1", unitCost: "0", stockUnitIds: [stockUnitId], units: [] },
    ],
  });

  it("accepts signed mixed gain and loss lines and normalizes the reason code", () => {
    const result = stockAdjustmentDraftSchema.parse(adjustment());
    expect(result.reasonCode).toBe("CYCLE CORRECTION");
    expect(result.lines.map((line) => line.quantityDelta)).toEqual(["2.5000", "-1"]);
  });

  it("rejects a zero quantity delta", () => {
    const value = adjustment();
    value.lines[0].quantityDelta = "0";
    expect(stockAdjustmentDraftSchema.safeParse(value).success).toBe(false);
  });
});

describe("physical stock-count schemas", () => {
  it("requires selected variants for a cycle count", () => {
    const value = { branchId: sourceBranchId, warehouseId: sourceWarehouseId, countDate: "2026-10-28", scopeMode: "CYCLE", reason: "Targeted high-value cycle count", variantIds: [], idempotencyKey: "count-create-test" };
    expect(stockCountCreateSchema.safeParse(value).success).toBe(false);
    expect(stockCountCreateSchema.safeParse({ ...value, variantIds: [variantId] }).success).toBe(true);
  });

  it("accepts decimal quantity results and scanned unit ids", () => {
    const result = stockCountRecordSchema.parse({ lines: [{ lineId: productId, countedQuantity: "3.5000", countedStockUnitIds: [stockUnitId], notes: "Verified twice" }] });
    expect(result.lines[0].countedQuantity).toBe("3.5000");
    expect(result.lines[0].countedStockUnitIds).toEqual([stockUnitId]);
  });
});
