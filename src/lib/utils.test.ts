import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/utils";

describe("money display formatting", () => {
  it("formats a large decimal string without Number conversion", () => {
    const result = formatMoney("999999999999999.6000", "PKR");
    expect(result).toContain("1,000,000,000,000,000");
  });

  it("rounds negative values symmetrically for display", () => {
    const result = formatMoney("-10.6000", "PKR");
    expect(result.startsWith("-")).toBe(true);
    expect(result.endsWith("11")).toBe(true);
  });
});
