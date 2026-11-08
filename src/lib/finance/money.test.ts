import { describe, expect, it } from "vitest";
import { decimal, moneyString, sumMoney } from "@/lib/finance/money";

describe("decimal-safe money helpers", () => {
  it("adds decimal strings without binary floating point drift", () => {
    expect(sumMoney(["0.1", "0.2"]).toFixed(4)).toBe("0.3000");
  });

  it("rounds deterministically to four decimal places", () => {
    expect(moneyString("12.34565")).toBe("12.3457");
    expect(moneyString("12.34564")).toBe("12.3456");
  });

  it("retains exact large monetary values", () => {
    expect(decimal("999999999999999.9999").toFixed(4)).toBe("999999999999999.9999");
  });
});
