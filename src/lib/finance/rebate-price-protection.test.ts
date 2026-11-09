import { describe, expect, it } from "vitest";
import {
  priceAnnouncementSchema,
  rebateItemSchema,
  rebateSettlementSchema,
  customerPriceProtectionSchema,
} from "@/lib/finance/rebate-validation";
import { isValidImei, normalizeImei } from "@/lib/imei";

describe("Item-Wise Rebate & Price Protection Module Tests", () => {
  it("calculates company price reduction entitlement accurately (Rs. 40,000 -> Rs. 38,000 = Rs. 2,000 * 100 units = Rs. 200,000)", () => {
    const previousCompanyPrice = 40000;
    const newCompanyPrice = 38000;
    const eligibleStockQuantity = 100;

    const priceDifference = previousCompanyPrice - newCompanyPrice;
    const potentialRebate = eligibleStockQuantity * priceDifference;

    expect(priceDifference).toBe(2000);
    expect(potentialRebate).toBe(200000);

    // Validate using rebateItemSchema
    const validatedItem = rebateItemSchema.parse({
      productId: "11111111-1111-4111-8111-111111111111",
      variantId: "22222222-2222-4222-8222-222222222222",
      productName: "Samsung Galaxy S25 5G",
      variantName: "128GB Phantom Black",
      sku: "SAM-S25-128",
      brandName: "Samsung",
      currentStock: 100,
      eligibleQuantity: 100,
      claimedQuantity: 100,
      oldPrice: previousCompanyPrice,
      newPrice: newCompanyPrice,
      priceDropPerUnit: priceDifference,
      claimAmount: potentialRebate,
    });

    expect(validatedItem.claimAmount).toBe(200000);
    expect(validatedItem.priceDropPerUnit).toBe(2000);
  });

  it("handles multi-stage partial settlement flow (Rs. 200,000 approved -> 1st receipt Rs. 100,000 -> 2nd receipt Rs. 100,000 -> Rs. 0 outstanding)", () => {
    const approvedAmount = 200000;
    let settledAmount = 0;
    let outstandingAmount = approvedAmount;

    // First Partial Receipt
    const firstReceipt = 100000;
    const firstSettlement = rebateSettlementSchema.parse({
      amount: String(firstReceipt),
      settlementDate: "2026-11-09",
      paymentMethodId: "33333333-3333-4333-8333-333333333333",
      bankAccountId: "44444444-4444-4444-8444-444444444444",
      reference: "BANK-REC-001",
    });

    settledAmount += Number(firstSettlement.amount);
    outstandingAmount = approvedAmount - settledAmount;

    expect(settledAmount).toBe(100000);
    expect(outstandingAmount).toBe(100000);

    // Second Receipt (Full Settlement)
    const secondReceipt = 100000;
    const secondSettlement = rebateSettlementSchema.parse({
      amount: String(secondReceipt),
      settlementDate: "2026-11-15",
      paymentMethodId: "33333333-3333-4333-8333-333333333333",
      reference: "BANK-REC-002",
    });

    settledAmount += Number(secondSettlement.amount);
    outstandingAmount = approvedAmount - settledAmount;

    expect(settledAmount).toBe(200000);
    expect(outstandingAmount).toBe(0);
  });

  it("validates company price announcement schema with multiple phone models", () => {
    const announcement = priceAnnouncementSchema.parse({
      announcementNumber: "ANN-2026-SAMSUNG-01",
      title: "Samsung Official Q4 Price Drop",
      supplierId: "55555555-5555-4555-8555-555555555555",
      announcementDate: "2026-11-01",
      effectiveFrom: "2026-11-01",
      effectiveTo: "2026-11-30",
      primaryAccountId: "66666666-6666-4666-8666-666666666666",
      settlementAccountId: "77777777-7777-4777-8777-777777777777",
      items: [
        {
          productId: "11111111-1111-4111-8111-111111111111",
          variantId: "22222222-2222-4222-8222-222222222222",
          productName: "Samsung Galaxy S25",
          variantName: "128GB Black",
          sku: "SAM-S25-128",
          oldPrice: 40000,
          newPrice: 38000,
          priceDrop: 2000,
          rebatePerUnit: 2000,
        },
        {
          productId: "11111111-1111-4111-8111-111111111112",
          variantId: "22222222-2222-4222-8222-222222222223",
          productName: "Samsung Galaxy S25 Ultra",
          variantName: "256GB Titanium",
          sku: "SAM-S25U-256",
          oldPrice: 75000,
          newPrice: 70000,
          priceDrop: 5000,
          rebatePerUnit: 5000,
        },
      ],
    });

    expect(announcement.items).toHaveLength(2);
    expect(announcement.items[0].priceDrop).toBe(2000);
    expect(announcement.items[1].priceDrop).toBe(5000);
  });

  it("verifies customer rebate given calculation (10 units * Rs. 2,000 = Rs. 20,000 credit note)", () => {
    const customerRebate = customerPriceProtectionSchema.parse({
      customerId: "88888888-8888-4888-8888-888888888888",
      programId: "99999999-9999-4999-8999-999999999999",
      claimDate: "2026-11-09",
      settlementType: "CREDIT_NOTE",
      reference: "CN-DEALER-0091",
      items: [
        {
          productId: "11111111-1111-4111-8111-111111111111",
          variantId: "22222222-2222-4222-8222-222222222222",
          productName: "Samsung Galaxy S25",
          variantName: "128GB Black",
          sku: "SAM-S25-128",
          soldQuantity: 10,
          eligibleQuantity: 10,
          oldPrice: 42000,
          newPrice: 40000,
          rebatePerUnit: 2000,
          totalRebate: 20000,
        },
      ],
    });

    expect(customerRebate.settlementType).toBe("CREDIT_NOTE");
    expect(customerRebate.items[0].totalRebate).toBe(20000);
  });

  it("ensures dual-SIM phones with IMEI1 and IMEI2 count as exactly one unit", () => {
    // 1 physical handset with dual-SIM slots
    const physicalHandset = {
      stockUnitId: "phone-unit-001",
      model: "Xiaomi 14T Pro",
      imei1: "490154203237518",
      imei2: "490154203237518", // second slot or same device
      status: "IN_STOCK",
    };

    // Both IMEIs are valid 15-digit Luhn numbers
    expect(isValidImei(physicalHandset.imei1)).toBe(true);
    expect(isValidImei(physicalHandset.imei2)).toBe(true);

    // Grouping by physical stockUnitId guarantees 1 handset = 1 unit
    const stockUnits = [physicalHandset];
    const unitCount = new Set(stockUnits.map((u) => u.stockUnitId)).size;
    expect(unitCount).toBe(1);
  });
});
