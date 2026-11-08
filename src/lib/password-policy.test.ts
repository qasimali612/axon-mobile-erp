import { describe, expect, it } from "vitest";
import { checkPasswordPolicy } from "./password-policy";

describe("password policy", () => {
  it("accepts a strong passphrase", () => {
    expect(checkPasswordPolicy("Inventory!Desk2026").valid).toBe(true);
  });

  it("reports missing controls", () => {
    const result = checkPasswordPolicy("short");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});
