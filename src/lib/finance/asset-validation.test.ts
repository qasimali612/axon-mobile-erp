import { describe, expect, it } from "vitest";
import { assetCategorySchema, assetDisposalSchema, capitalizationSchema, depreciationGenerateSchema, fixedAssetSchema } from "./asset-validation";

const accountId = (suffix: string) => `1111111${suffix}-1111-4111-8111-111111111111`;
const categoryId = "22222222-2222-4222-8222-222222222222";
const branchId = "33333333-3333-4333-8333-333333333333";

const category = {
  code: "equip",
  name: "Office equipment",
  depreciable: true,
  defaultUsefulLifeMonths: 60,
  defaultMethod: "STRAIGHT_LINE" as const,
  defaultRate: null,
  assetAccountId: accountId("1"),
  accumulatedAccountId: accountId("2"),
  expenseAccountId: accountId("3"),
  disposalAccountId: accountId("4"),
  isActive: true,
};

const asset = {
  categoryId,
  branchId,
  code: "fa-100",
  name: "Showroom counter",
  description: null,
  serialNumber: null,
  supplierId: null,
  custodianId: null,
  assetLocation: "Showroom",
  purchaseDate: "2026-10-01",
  capitalizationDate: "2026-10-05",
  depreciationStartDate: null,
  purchaseCost: "50000",
  additionalCost: "0",
  residualValue: "0",
  usefulLifeMonths: 60,
  depreciationMethod: "STRAIGHT_LINE" as const,
  depreciationRate: null,
};

describe("asset category validation", () => {
  it("normalizes the category code", () => {
    expect(assetCategorySchema.parse(category).code).toBe("EQUIP");
  });

  it("rejects a code with unsupported characters", () => {
    expect(assetCategorySchema.safeParse({ ...category, code: "office equipment" }).success).toBe(false);
  });

  it("requires every ledger mapping", () => {
    expect(assetCategorySchema.safeParse({ ...category, disposalAccountId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a negative default rate", () => {
    expect(assetCategorySchema.safeParse({ ...category, defaultRate: "-5" }).success).toBe(false);
  });
});

describe("fixed asset draft validation", () => {
  it("accepts a coherent draft and uppercases its code", () => {
    const parsed = fixedAssetSchema.parse(asset);
    expect(parsed.code).toBe("FA-100");
    expect(parsed.additionalCost).toBe("0");
  });

  it("rejects a capitalization date before the purchase date", () => {
    expect(fixedAssetSchema.safeParse({ ...asset, capitalizationDate: "2026-09-30" }).success).toBe(false);
  });

  it("rejects a negative or non-numeric purchase cost", () => {
    expect(fixedAssetSchema.safeParse({ ...asset, purchaseCost: "-1" }).success).toBe(false);
    expect(fixedAssetSchema.safeParse({ ...asset, purchaseCost: "fifty" }).success).toBe(false);
  });

  it("rejects an unusable depreciation rate", () => {
    expect(fixedAssetSchema.safeParse({ ...asset, depreciationRate: "150" }).success).toBe(false);
  });

  it("rejects an unsupported date format", () => {
    expect(fixedAssetSchema.safeParse({ ...asset, purchaseDate: "01/10/2026" }).success).toBe(false);
  });
});

describe("fixed asset transaction inputs", () => {
  it("requires a settlement account to capitalize", () => {
    expect(capitalizationSchema.safeParse({ settlementAccountId: accountId("9") }).success).toBe(true);
    expect(capitalizationSchema.safeParse({ settlementAccountId: "" }).success).toBe(false);
  });

  it("requires a YYYY-MM depreciation period", () => {
    expect(depreciationGenerateSchema.safeParse({ periodDate: "2026-10-31" }).success).toBe(true);
    expect(depreciationGenerateSchema.safeParse({ periodDate: "2026-13-01" }).success).toBe(false);
  });

  it("requires a meaningful disposal reason", () => {
    expect(assetDisposalSchema.safeParse({ disposalDate: "2026-10-20", method: "SALE", proceeds: "100", reason: "sold" }).success).toBe(false);
    expect(assetDisposalSchema.safeParse({ disposalDate: "2026-10-20", method: "SALE", proceeds: "100", reason: "Sold to an employee after approval" }).success).toBe(true);
  });

  it("rejects an unknown disposal method and negative proceeds", () => {
    expect(assetDisposalSchema.safeParse({ disposalDate: "2026-10-20", method: "LOST", proceeds: "0", reason: "Asset cannot be located after count" }).success).toBe(false);
    expect(assetDisposalSchema.safeParse({ disposalDate: "2026-10-20", method: "SCRAP", proceeds: "-5", reason: "Scrapped after physical inspection" }).success).toBe(false);
  });
});
