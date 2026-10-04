import { afterEach, describe, expect, it } from "vitest";
import { computeCheckoutAmount } from "./billing";
import {
  DEFAULT_PLAN_CONFIG,
  applyPlanOverrides,
  describePlanChanges,
  diffPlanConfig,
  getPlanConfig,
  isLargePriceChange,
  isLimitDecrease,
  setPlanConfig,
  validatePlanConfig,
  validatePlanOverrides
} from "./plan-config";
import { monthlyRecurringRevenueInr } from "./owner-console";

afterEach(() => setPlanConfig(DEFAULT_PLAN_CONFIG));

describe("applyPlanOverrides", () => {
  it("changes only what was overridden and never mutates the defaults", () => {
    const next = applyPlanOverrides(DEFAULT_PLAN_CONFIG, { plans: { growth: { priceInr: 4499 } }, addonPrices: { extraUser: 449 } });
    expect(next.plans.growth.priceInr).toBe(4499);
    expect(next.plans.growth.users).toBe(DEFAULT_PLAN_CONFIG.plans.growth.users);
    expect(next.addonPrices.extraUser).toBe(449);
    expect(next.topupPrices).toEqual(DEFAULT_PLAN_CONFIG.topupPrices);
    expect(DEFAULT_PLAN_CONFIG.plans.growth.priceInr).toBe(3999);
  });

  it("ignores any override of the free or partner plans, even if one was stored", () => {
    const next = applyPlanOverrides(DEFAULT_PLAN_CONFIG, { plans: { free: { priceInr: 500, users: 50 }, partner: { priceInr: 1 } } });
    expect(next.plans.free).toEqual(DEFAULT_PLAN_CONFIG.plans.free);
    expect(next.plans.partner).toEqual(DEFAULT_PLAN_CONFIG.plans.partner);
  });
});

describe("validatePlanOverrides", () => {
  it("accepts sensible values", () => {
    expect(validatePlanOverrides({ plans: { starter: { priceInr: 1699, users: 3 } }, addonPrices: { extraUser: 449 }, topupPrices: { credits1000: 849 } })).toEqual([]);
  });

  it("rejects the free and partner plans, unknown fields, unknown add-ons and top-ups", () => {
    expect(validatePlanOverrides({ plans: { free: { priceInr: 99 } } })[0]).toContain("free plan can't be edited");
    expect(validatePlanOverrides({ plans: { starter: { recordingRetentionDays: 5 } as never } })[0]).toContain("can't be edited");
    expect(validatePlanOverrides({ addonPrices: { nonsense: 5 } as never })[0]).toContain("Unknown add-on");
    expect(validatePlanOverrides({ topupPrices: { nonsense: 5 } as never })[0]).toContain("Unknown top-up");
  });

  it("rejects absurd, fractional, negative and non-numeric values", () => {
    for (const bad of [0, -5, 98, 100_001, 1499.5, "1499" as never, NaN]) {
      expect(validatePlanOverrides({ plans: { starter: { priceInr: bad } } }).length, String(bad)).toBeGreaterThan(0);
    }
    expect(validatePlanOverrides({ plans: { growth: { users: 0 } } }).length).toBeGreaterThan(0);
  });
});

describe("validatePlanConfig", () => {
  it("accepts the defaults", () => {
    expect(validatePlanConfig(DEFAULT_PLAN_CONFIG)).toEqual([]);
  });

  it("requires each tier to cost more and allow at least as much as the one below", () => {
    const cheaperPro = applyPlanOverrides(DEFAULT_PLAN_CONFIG, { plans: { pro: { priceInr: 3000 } } });
    expect(validatePlanConfig(cheaperPro)).toContain("Pro must cost more than Growth.");
    const smallerGrowth = applyPlanOverrides(DEFAULT_PLAN_CONFIG, { plans: { growth: { users: 1 } } });
    expect(validatePlanConfig(smallerGrowth)).toContain("Growth must not allow fewer users than Starter.");
  });
});

describe("diffing and safety classification", () => {
  const after = applyPlanOverrides(DEFAULT_PLAN_CONFIG, { plans: { growth: { priceInr: 5499, contacts: 20_000 } }, topupPrices: { credits1000: 819 } });

  it("lists exactly what changed", () => {
    expect(describePlanChanges(diffPlanConfig(DEFAULT_PLAN_CONFIG, after))).toBe("growth priceInr: 3999 → 5499, growth contacts: 25000 → 20000, top-up credits1000: 799 → 819");
    expect(describePlanChanges(diffPlanConfig(DEFAULT_PLAN_CONFIG, DEFAULT_PLAN_CONFIG))).toBe("no change");
  });

  it("flags a price move of more than 25% as large, and small ones as ordinary", () => {
    const changes = diffPlanConfig(DEFAULT_PLAN_CONFIG, after);
    expect(isLargePriceChange(changes[0]!)).toBe(true); // 3999 -> 5499 (+37%)
    expect(isLargePriceChange(changes[2]!)).toBe(false); // top-up +2.5%
  });

  it("flags lowering a limit that existing customers might be above, but not raising one", () => {
    const [, contacts] = diffPlanConfig(DEFAULT_PLAN_CONFIG, after);
    expect(isLimitDecrease(contacts!)).toBe(true);
    const raised = diffPlanConfig(DEFAULT_PLAN_CONFIG, applyPlanOverrides(DEFAULT_PLAN_CONFIG, { plans: { growth: { contacts: 30_000 } } }));
    expect(isLimitDecrease(raised[0]!)).toBe(false);
    const credits = diffPlanConfig(DEFAULT_PLAN_CONFIG, applyPlanOverrides(DEFAULT_PLAN_CONFIG, { plans: { growth: { aiCreditsPerMonth: 100 } } }));
    expect(isLimitDecrease(credits[0]!)).toBe(false); // credits aren't a hard cap on existing usage
  });
});

describe("live configuration drives pricing", () => {
  it("checkout and recurring-revenue maths follow a changed price, and GST is added on top", () => {
    expect(computeCheckoutAmount({ kind: "plan", planId: "starter", billingCycle: "monthly" }).baseInr).toBe(1499);
    setPlanConfig(applyPlanOverrides(DEFAULT_PLAN_CONFIG, { plans: { starter: { priceInr: 1799 } }, addonPrices: { extraUser: 449 }, topupPrices: { credits1000: 849 } }));

    const plan = computeCheckoutAmount({ kind: "plan", planId: "starter", billingCycle: "monthly" });
    expect(plan).toMatchObject({ baseInr: 1799, gstInr: 324, totalInr: 2123 });
    expect(computeCheckoutAmount({ kind: "plan", planId: "starter", billingCycle: "yearly" }).baseInr).toBe(17_990);
    expect(computeCheckoutAmount({ kind: "addon", addonKey: "extraUser", quantity: 2 }).baseInr).toBe(898);
    expect(computeCheckoutAmount({ kind: "topup", topupKey: "credits1000" }).baseInr).toBe(849);
    expect(monthlyRecurringRevenueInr("starter", "monthly", "active")).toBe(1799);
    expect(getPlanConfig().plans.starter.priceInr).toBe(1799);
  });
});
