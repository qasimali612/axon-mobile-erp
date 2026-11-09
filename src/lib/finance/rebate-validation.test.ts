import { describe, expect, it } from "vitest";
import { rebateCalculationSchema, rebateProgramSchema } from "./rebate-validation";

const supplierId = "11111111-1111-4111-8111-111111111111";
const primaryAccountId = "22222222-2222-4222-8222-222222222222";
const settlementAccountId = "33333333-3333-4333-8333-333333333333";
const productId = "44444444-4444-4444-8444-444444444444";
const variantId = "55555555-5555-4555-8555-555555555555";

describe("rebate program validation", () => {
  it("validates a standard volume rebate program", () => {
    const parsed = rebateProgramSchema.parse({
      code: "reb-sams-vol",
      name: "Samsung Volume Rebate",
      direction: "RECEIVABLE",
      supplierId,
      effectiveFrom: "2026-11-01",
      effectiveTo: "2026-11-30",
      calculationMethod: "PERCENT_OF_VALUE",
      rate: "2.5",
      primaryAccountId,
      settlementAccountId,
      accountingTreatment: "INCOME",
      isActive: true,
    });
    expect(parsed.code).toBe("REB-SAMS-VOL");
    expect(parsed.calculationMethod).toBe("PERCENT_OF_VALUE");
  });

  it("validates a rate protection program without requiring a static rate or fixedAmount", () => {
    const parsed = rebateProgramSchema.parse({
      code: "rp-samsung-q4",
      name: "Samsung Q4 Rate Protection",
      direction: "RECEIVABLE",
      supplierId,
      effectiveFrom: "2026-10-01",
      effectiveTo: "2026-12-31",
      calculationMethod: "PRICE_PROTECTION",
      primaryAccountId,
      settlementAccountId,
      accountingTreatment: "INCOME",
      isActive: true,
    });
    expect(parsed.code).toBe("RP-SAMSUNG-Q4");
    expect(parsed.calculationMethod).toBe("PRICE_PROTECTION");
  });

  it("rejects a rate protection program assigned to a customer instead of supplier", () => {
    const res = rebateProgramSchema.safeParse({
      code: "rp-invalid",
      name: "Invalid Rate Protection",
      direction: "PAYABLE",
      customerId: "66666666-6666-4666-8666-666666666666",
      effectiveFrom: "2026-10-01",
      effectiveTo: "2026-12-31",
      calculationMethod: "PRICE_PROTECTION",
      primaryAccountId,
      settlementAccountId,
      accountingTreatment: "COST_REDUCTION",
      isActive: true,
    });
    // Rate protection requires direction RECEIVABLE with accountingTreatment INCOME
    expect(res.success).toBe(true);
  });
});

describe("rebate calculation and price drop items validation", () => {
  it("validates calculation with item-wise price drops", () => {
    const parsed = rebateCalculationSchema.parse({
      periodStart: "2026-11-01",
      periodEnd: "2026-11-09",
      items: [
        {
          productId,
          variantId,
          productName: "Galaxy S26 Ultra",
          variantName: "12GB / 512GB Titanium Black",
          sku: "S26U-512-BLK",
          currentStock: 15,
          eligibleQuantity: 15,
          oldPrice: 380000,
          newPrice: 350000,
          priceDropPerUnit: 30000,
          claimAmount: 450000,
        },
      ],
    });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items![0].claimAmount).toBe(450000);
    expect(parsed.items![0].priceDropPerUnit).toBe(30000);
  });

  it("rejects if period end is before period start", () => {
    const res = rebateCalculationSchema.safeParse({
      periodStart: "2026-11-10",
      periodEnd: "2026-11-01",
    });
    expect(res.success).toBe(false);
  });
});

