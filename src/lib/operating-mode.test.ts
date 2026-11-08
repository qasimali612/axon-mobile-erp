import { describe, expect, it, vi } from "vitest";
import { assertMakerChecker, assertSegregationOfDuties } from "./operating-mode";

describe("Operating Mode & Segregation Rules", () => {
  const companyId = "c0000000-0000-0000-0000-000000000001";
  const user1 = "u0000000-0000-0000-0000-000000000001";
  const user2 = "u0000000-0000-0000-0000-000000000002";
  const user3 = "u0000000-0000-0000-0000-000000000003";

  const multiUserTx = {
    systemSetting: {
      findUnique: vi.fn().mockResolvedValue({
        value: { mode: "MULTI_USER" },
        updatedAt: new Date(),
        updatedById: null,
      }),
    },
  } as any;

  const singleUserTx = {
    systemSetting: {
      findUnique: vi.fn().mockResolvedValue({
        value: { mode: "SINGLE_USER" },
        updatedAt: new Date(),
        updatedById: null,
      }),
    },
  } as any;

  describe("MULTI_USER mode enforcement", () => {
    it("assertMakerChecker throws 409 MAKER_CHECKER_REQUIRED when preparer attempts to approve or reject", async () => {
      await expect(
        assertMakerChecker(multiUserTx, companyId, user1, user1, "approve this purchase order")
      ).rejects.toThrow("The preparer cannot approve this purchase order in Multi-User Mode");
    });

    it("assertMakerChecker succeeds when checker is different from maker", async () => {
      await expect(
        assertMakerChecker(multiUserTx, companyId, user1, user2, "approve this purchase order")
      ).resolves.toBeUndefined();
    });

    it("assertSegregationOfDuties throws 409 SEGREGATION_OF_DUTIES when poster is preparer or approver", async () => {
      // Poster is same as preparer
      await expect(
        assertSegregationOfDuties(multiUserTx, companyId, user1, user1, user2, "post this invoice")
      ).rejects.toThrow("The user cannot post this invoice in Multi-User Mode due to segregation of duties");

      // Poster is same as approver
      await expect(
        assertSegregationOfDuties(multiUserTx, companyId, user2, user1, user2, "post this invoice")
      ).rejects.toThrow("The user cannot post this invoice in Multi-User Mode due to segregation of duties");
    });

    it("assertSegregationOfDuties succeeds when poster is independent third party", async () => {
      await expect(
        assertSegregationOfDuties(multiUserTx, companyId, user3, user1, user2, "post this invoice")
      ).resolves.toBeUndefined();
    });
  });

  describe("SINGLE_USER mode waived enforcement", () => {
    it("assertMakerChecker waives separation so sole operator can approve and post directly", async () => {
      // Even though actorId === preparerId, in single user mode it resolves without error
      await expect(
        assertMakerChecker(singleUserTx, companyId, user1, user1, "approve this purchase order")
      ).resolves.toBeUndefined();
    });

    it("assertSegregationOfDuties waives segregation so sole operator can post without secondary users", async () => {
      // Sole operator is preparer, approver, and poster
      await expect(
        assertSegregationOfDuties(singleUserTx, companyId, user1, user1, user1, "post this goods receipt", [user1])
      ).resolves.toBeUndefined();
    });
  });
});
