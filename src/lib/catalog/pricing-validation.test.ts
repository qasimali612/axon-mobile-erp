import { describe, expect, it } from "vitest";
import { paymentMethodMasterSchema, priceListMasterSchema, priceListItemUpsertSchema } from "./pricing-validation";

const variantA = "11111111-1111-4111-8111-111111111111";
const variantB = "22222222-2222-4222-8222-222222222222";
const cashAccount = "33333333-3333-4333-8333-333333333333";
const bankAccount = "44444444-4444-4444-8444-444444444444";

const baseList = { code: "retail", name: "Retail list", priceLevel: "RETAIL", currencyCode: "pkr", isDefault: false, isActive: true, effectiveFrom: null, effectiveTo: null, notes: null, items: [] };

describe("price list validation", () => {
  it("normalizes codes and currency and keeps a valid list", () => {
    const parsed = priceListMasterSchema.parse(baseList);
    expect(parsed.code).toBe("RETAIL");
    expect(parsed.currencyCode).toBe("PKR");
  });

  it("rejects a reversed effective window", () => {
    expect(priceListMasterSchema.safeParse({ ...baseList, effectiveFrom: "2026-05-10", effectiveTo: "2026-05-01" }).success).toBe(false);
  });

  it("rejects duplicate variants and a minimum above the list price", () => {
    expect(priceListMasterSchema.safeParse({ ...baseList, items: [{ variantId: variantA, price: "10.00", minimumPrice: null }, { variantId: variantA, price: "12.00", minimumPrice: null }] }).success).toBe(false);
    expect(priceListMasterSchema.safeParse({ ...baseList, items: [{ variantId: variantA, price: "10.00", minimumPrice: "11.00" }] }).success).toBe(false);
  });

  it("rejects a default list that is inactive", () => {
    expect(priceListMasterSchema.safeParse({ ...baseList, isDefault: true, isActive: false }).success).toBe(false);
  });

  it("accepts normalized multi-variant price lines", () => {
    const parsed = priceListItemUpsertSchema.parse({ items: [{ variantId: variantA, price: "1500.0000", minimumPrice: "1400.0000" }, { variantId: variantB, price: "2500", minimumPrice: null }] });
    expect(parsed.items).toHaveLength(2);
  });

  it("rejects negative or over-precise prices", () => {
    expect(priceListItemUpsertSchema.safeParse({ items: [{ variantId: variantA, price: "-1", minimumPrice: null }] }).success).toBe(false);
    expect(priceListItemUpsertSchema.safeParse({ items: [{ variantId: variantA, price: "10.12345", minimumPrice: null }] }).success).toBe(false);
  });
});

const baseMethod = { code: "cash", name: "Counter cash", methodType: "CASH", cashAccountId: cashAccount, bankAccountId: null, requiresReference: false, sequence: 10, isActive: true, notes: null };

describe("payment method validation", () => {
  it("accepts a cash method bound to a cash account", () => {
    const parsed = paymentMethodMasterSchema.parse(baseMethod);
    expect(parsed.code).toBe("CASH");
    expect(parsed.methodType).toBe("CASH");
  });

  it("accepts a card method bound to a bank account", () => {
    expect(paymentMethodMasterSchema.safeParse({ ...baseMethod, methodType: "CARD", cashAccountId: null, bankAccountId: bankAccount, requiresReference: true }).success).toBe(true);
  });

  it("rejects cash methods without a cash account or with a bank account", () => {
    expect(paymentMethodMasterSchema.safeParse({ ...baseMethod, cashAccountId: null }).success).toBe(false);
    expect(paymentMethodMasterSchema.safeParse({ ...baseMethod, bankAccountId: bankAccount }).success).toBe(false);
  });

  it("rejects non-cash methods without a bank account", () => {
    expect(paymentMethodMasterSchema.safeParse({ ...baseMethod, methodType: "BANK_TRANSFER", cashAccountId: null, bankAccountId: null }).success).toBe(false);
  });
});
