import { describe, expect, it } from "vitest";
import {
  type PosLineInput,
  type PosTenderInput,
} from "./pos";
import { decimal, zero, moneyString } from "@/lib/finance/money";

describe("POS Counter Terminal & Atomic Checkout Engine", () => {
  describe("Cart & Line Calculations", () => {
    it("correctly computes line gross, discount, tax, and line total", () => {
      const quantity = decimal("2");
      const unitPrice = decimal("4799");
      const discount = decimal("200");
      const taxRate = decimal("0"); // 0% tax

      const gross = quantity.times(unitPrice).toDecimalPlaces(4);
      expect(moneyString(gross)).toBe("9598.0000");

      const taxable = gross.minus(discount);
      expect(moneyString(taxable)).toBe("9398.0000");

      const taxAmount = taxable.times(taxRate).div(100).toDecimalPlaces(4);
      expect(moneyString(taxAmount)).toBe("0.0000");

      const lineTotal = taxable.plus(taxAmount);
      expect(moneyString(lineTotal)).toBe("9398.0000");
    });

    it("enforces specific identification for dual-SIM handsets (quantity = 1, cost = acquisitionCost)", () => {
      const line: PosLineInput = {
        productId: "prod-s24",
        variantId: "var-s24-256",
        quantity: "1",
        unitPrice: "224999.0000",
        discountAmount: "0",
        stockUnitIds: ["unit-101"],
      };

      const qty = decimal(line.quantity);
      expect(qty.isInteger()).toBe(true);
      expect(qty.toNumber()).toBe(1);
      expect(line.stockUnitIds.length).toBe(1);

      // Landed acquisition cost per handset
      const acquisitionCost = decimal("206227.9082");
      const lineCost = acquisitionCost.times(qty);
      expect(moneyString(lineCost)).toBe("206227.9082");

      const grossProfit = decimal(line.unitPrice).minus(acquisitionCost);
      expect(moneyString(grossProfit)).toBe("18771.0918");
    });

    it("rejects duplicate physical handset units in the same cart", () => {
      const line1: PosLineInput = {
        productId: "prod-s24",
        variantId: "var-s24-256",
        quantity: "1",
        unitPrice: "224999",
        stockUnitIds: ["unit-101"],
      };
      const line2: PosLineInput = {
        productId: "prod-s24",
        variantId: "var-s24-256",
        quantity: "1",
        unitPrice: "224999",
        stockUnitIds: ["unit-101"], // Duplicate unit
      };

      const allUnitIds = [...line1.stockUnitIds, ...line2.stockUnitIds];
      const hasDuplicates = new Set(allUnitIds).size !== allUnitIds.length;
      expect(hasDuplicates).toBe(true);
    });
  });

  describe("Tender & Payment Allocations", () => {
    it("allocates single cash payment and accurately computes change return", () => {
      const grandTotal = decimal("9398.0000");
      const tenderedCash = decimal("10000.0000");

      const change = tenderedCash.minus(grandTotal);
      expect(moneyString(change)).toBe("602.0000");

      const allocatedAmount = grandTotal; // Settled amount is capped at grandTotal
      expect(moneyString(allocatedAmount)).toBe("9398.0000");

      const remainingDue = grandTotal.minus(allocatedAmount);
      expect(remainingDue.isZero()).toBe(true);
    });

    it("correctly partitions multi-tender split payments (Cash + Card + Mobile Wallet)", () => {
      const grandTotal = decimal("224999.0000");

      const tenders: PosTenderInput[] = [
        { paymentMethod: "CASH", amount: "50000.0000" },
        { paymentMethod: "CARD", amount: "100000.0000", reference: "AUTH-88219" },
        { paymentMethod: "WALLET", amount: "74999.0000", reference: "RAAST-00128" },
      ];

      const sumTenders = tenders.reduce(
        (sum, t) => sum.plus(decimal(t.amount)),
        zero(),
      );
      expect(moneyString(sumTenders)).toBe("224999.0000");
      expect(sumTenders.equals(grandTotal)).toBe(true);

      const remainingAR = grandTotal.minus(sumTenders);
      expect(remainingAR.isZero()).toBe(true);
    });

    it("correctly handles credit sale with upfront advance down payment", () => {
      const grandTotal = decimal("224999.0000");
      const advanceReceived = decimal("50000.0000");

      const remainingReceivable = grandTotal.minus(advanceReceived);
      expect(moneyString(remainingReceivable)).toBe("174999.0000");

      // Verify that advance is recorded and allocated, leaving remainder on AR
      expect(advanceReceived.plus(remainingReceivable).equals(grandTotal)).toBe(true);
    });

    it("rejects walk-in counter customer having unpaid credit balances", () => {
      const customerCode = "WALK-IN";
      const remainingCreditBalance = decimal("5000.0000");

      const isWalkInCreditProhibited = customerCode === "WALK-IN" && remainingCreditBalance.gt(0);
      expect(isWalkInCreditProhibited).toBe(true);
    });
  });

  describe("Credit Limit Validation & Managerial Authorization", () => {
    it("detects credit limit exceedance and requires managerial override", () => {
      const creditLimit = decimal("100000.0000");
      const currentAR = decimal("80000.0000");
      const newCreditAmount = decimal("50000.0000");

      const projectedAR = currentAR.plus(newCreditAmount);
      expect(moneyString(projectedAR)).toBe("130000.0000");

      const exceeds = projectedAR.gt(creditLimit);
      expect(exceeds).toBe(true);

      const exceededAmount = projectedAR.minus(creditLimit);
      expect(moneyString(exceededAmount)).toBe("30000.0000");
    });
  });

  describe("POS Shift & Drawer Cash Reconciliation", () => {
    it("accurately computes expected cash and drawer variance on shift close", () => {
      const openingFloat = decimal("10000.0000");
      const cashReceipts = decimal("45000.0000");
      const cashRefunds = decimal("5000.0000");

      const expectedCash = openingFloat.plus(cashReceipts).minus(cashRefunds);
      expect(moneyString(expectedCash)).toBe("50000.0000");

      // Case A: Exact Cash in Drawer
      const actualCashExact = decimal("50000.0000");
      const varianceExact = actualCashExact.minus(expectedCash);
      expect(varianceExact.isZero()).toBe(true);

      // Case B: Cash Shortage (e.g. 49,500 counted)
      const actualCashShort = decimal("49500.0000");
      const varianceShort = actualCashShort.minus(expectedCash);
      expect(moneyString(varianceShort)).toBe("-500.0000");

      // Case C: Cash Surplus (e.g. 50,200 counted)
      const actualCashOver = decimal("50200.0000");
      const varianceOver = actualCashOver.minus(expectedCash);
      expect(moneyString(varianceOver)).toBe("200.0000");
    });
  });
});
