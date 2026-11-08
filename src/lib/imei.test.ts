import { describe, expect, it } from "vitest";
import { isValidImei, normalizeImei } from "./imei";

describe("IMEI utility", () => {
  it("normalizes spaces and dashes", () => {
    expect(normalizeImei("49015420-323751 8")).toBe("490154203237518");
  });

  it("validates the Luhn check digit", () => {
    expect(isValidImei("490154203237518")).toBe(true);
    expect(isValidImei("490154203237519")).toBe(false);
  });

  it("does not accept non-15-digit values", () => {
    expect(isValidImei("12345")).toBe(false);
  });
});
