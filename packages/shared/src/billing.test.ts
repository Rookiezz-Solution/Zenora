import { describe, expect, it } from "vitest";
import { computeCheckoutAmount } from "./billing";

describe("computeCheckoutAmount", () => {
  it("prices a monthly plan with 18% GST on top", () => {
    const result = computeCheckoutAmount({ kind: "plan", planId: "starter", billingCycle: "monthly" });
    expect(result.baseInr).toBe(1499);
    expect(result.gstInr).toBe(270); // round(1499 * 0.18)
    expect(result.totalInr).toBe(1769);
  });

  it("prices a yearly plan at 10 months (2 months free), GST on the discounted base", () => {
    const result = computeCheckoutAmount({ kind: "plan", planId: "growth", billingCycle: "yearly" });
    expect(result.baseInr).toBe(3999 * 10);
    expect(result.gstInr).toBe(Math.round(3999 * 10 * 0.18));
  });

  it("throws for a plan with no self-serve price (partner)", () => {
    expect(() => computeCheckoutAmount({ kind: "plan", planId: "partner", billingCycle: "monthly" })).toThrow();
  });

  it("prices an addon by unit price times quantity", () => {
    const result = computeCheckoutAmount({ kind: "addon", addonKey: "extraUser", quantity: 3 });
    expect(result.baseInr).toBe(399 * 3);
    expect(result.description).toContain("× 3");
  });

  it("prices a credit top-up flat, no quantity multiplier", () => {
    const result = computeCheckoutAmount({ kind: "topup", topupKey: "credits3000" });
    expect(result.baseInr).toBe(2199);
    expect(result.gstInr).toBe(Math.round(2199 * 0.18));
  });
});
