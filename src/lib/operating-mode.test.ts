import { describe, expect, it, vi } from "vitest";
import { assertMakerChecker, assertSegregationOfDuties } from "./operating-mode";

describe("Operating Mode & Direct Posting Rules", () => {
  const companyId = "c0000000-0000-0000-0000-000000000001";
  const user1 = "u0000000-0000-0000-0000-000000000001";
  const user2 = "u0000000-0000-0000-0000-000000000002";
  const user3 = "u0000000-0000-0000-0000-000000000003";

  const tx = {
    systemSetting: {
      findUnique: vi.fn().mockResolvedValue({
        value: { mode: "SINGLE_USER" },
        updatedAt: new Date(),
        updatedById: null,
      }),
    },
  } as any;

  describe("Approval and Segregation Restrictions Waived Project-Wide", () => {
    it("assertMakerChecker waives separation so preparer can approve directly", async () => {
      await expect(
        assertMakerChecker(tx, companyId, user1, user1, "approve this purchase order")
      ).resolves.toBeUndefined();
    });

    it("assertMakerChecker succeeds when checker is different from maker", async () => {
      await expect(
        assertMakerChecker(tx, companyId, user1, user2, "approve this purchase order")
      ).resolves.toBeUndefined();
    });

    it("assertSegregationOfDuties waives segregation so sole user can post directly", async () => {
      await expect(
        assertSegregationOfDuties(tx, companyId, user1, user1, user2, "post this invoice")
      ).resolves.toBeUndefined();

      await expect(
        assertSegregationOfDuties(tx, companyId, user2, user1, user2, "post this invoice")
      ).resolves.toBeUndefined();

      await expect(
        assertSegregationOfDuties(tx, companyId, user3, user1, user2, "post this invoice")
      ).resolves.toBeUndefined();
    });
  });
});
