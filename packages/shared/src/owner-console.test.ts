import { describe, expect, it } from "vitest";
import { describeLimitChange, estimateEconomics, monthlyRecurringRevenueInr } from "./owner-console";
import { PLAN_LIMITS, YEARLY_MONTHS_CHARGED } from "./plans";

describe("monthlyRecurringRevenueInr", () => {
  it("is the plan price for an active monthly subscription", () => {
    expect(monthlyRecurringRevenueInr("growth", "monthly", "active")).toBe(PLAN_LIMITS.growth.priceInr);
  });

  it("spreads a yearly payment over twelve months", () => {
    const price = PLAN_LIMITS.starter.priceInr!;
    expect(monthlyRecurringRevenueInr("starter", "yearly", "active")).toBe(Math.round((price * YEARLY_MONTHS_CHARGED) / 12));
  });

  it("counts nothing for free, partner, trial or lapsed subscriptions", () => {
    expect(monthlyRecurringRevenueInr("free", "monthly", "active")).toBe(0);
    expect(monthlyRecurringRevenueInr("partner", "monthly", "active")).toBe(0);
    expect(monthlyRecurringRevenueInr("pro", "monthly", "trialing")).toBe(0);
    expect(monthlyRecurringRevenueInr("pro", "monthly", "past_due")).toBe(0);
  });
});

describe("estimateEconomics", () => {
  it("subtracts AI provider cost (0.25 per credit) from paid invoices", () => {
    expect(estimateEconomics({ paidInvoicesInr: 1499, creditsUsed: 400 })).toEqual({ revenueInr: 1499, costInr: 100, marginInr: 1399, marginPct: 93.3 });
  });

  it("has no margin percentage without revenue, and shows a loss as negative", () => {
    expect(estimateEconomics({ paidInvoicesInr: 0, creditsUsed: 200 })).toEqual({ revenueInr: 0, costInr: 50, marginInr: -50, marginPct: null });
  });
});

describe("describeLimitChange", () => {
  const none = { contacts: null, users: null, instagramAccounts: null };
  it("lists only what changed", () => {
    expect(describeLimitChange(none, { ...none, contacts: 8000 })).toBe("contacts: plan default → 8000");
    expect(describeLimitChange({ ...none, users: 3 }, { ...none, users: null })).toBe("users: 3 → plan default");
    expect(describeLimitChange(none, none)).toBe("no change");
  });
});
