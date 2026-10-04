import { describe, expect, it } from "vitest";
import { effectivePlanId, lifecycleAction, monthStartUtc, planNotice, resetCreditBalance } from "./subscription-lifecycle";

const now = new Date("2026-10-10T00:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe("effectivePlanId", () => {
  it("is free with no subscription, and after cancelling", () => {
    expect(effectivePlanId(null, now)).toBe("free");
    expect(effectivePlanId({ planId: "pro", status: "canceled", currentPeriodEnd: days(20) }, now)).toBe("free");
  });
  it("gives the trial plan until the trial ends, then free even before any sweep runs", () => {
    expect(effectivePlanId({ planId: "growth", status: "trialing", trialEndsAt: days(3) }, now)).toBe("growth");
    expect(effectivePlanId({ planId: "growth", status: "trialing", trialEndsAt: days(-1) }, now)).toBe("free");
    expect(effectivePlanId({ planId: "growth", status: "trialing", trialEndsAt: null }, now)).toBe("free");
  });
  it("keeps a paid plan through a 5-day grace after the period ends, then drops to free", () => {
    expect(effectivePlanId({ planId: "starter", status: "active", currentPeriodEnd: days(-4) }, now)).toBe("starter");
    expect(effectivePlanId({ planId: "starter", status: "past_due", currentPeriodEnd: days(-5) }, now)).toBe("free");
  });
  it("leaves plans without an end date (partner, comped) alone", () => {
    expect(effectivePlanId({ planId: "partner", status: "active" }, now)).toBe("partner");
    expect(effectivePlanId({ planId: "pro", status: "active", currentPeriodEnd: null }, now)).toBe("pro");
  });
});

describe("lifecycleAction", () => {
  const sub = (status: string, end: Date | null, planId = "starter", trialEndsAt: Date | null = null) => ({ planId, status, currentPeriodEnd: end, trialEndsAt });
  it("ends an expired trial and ignores a running one", () => {
    expect(lifecycleAction(sub("trialing", null, "growth", days(-1)), now)).toBe("trial_ended");
    expect(lifecycleAction(sub("trialing", null, "growth", days(5)), now)).toBe("none");
  });
  it("reminds in the last 3 days, marks past due at the end, lapses after the grace", () => {
    expect(lifecycleAction(sub("active", days(10)), now)).toBe("none");
    expect(lifecycleAction(sub("active", days(2)), now)).toBe("renewal_reminder");
    expect(lifecycleAction(sub("active", days(-1)), now)).toBe("past_due");
    expect(lifecycleAction(sub("past_due", days(-1)), now)).toBe("none"); // already marked
    expect(lifecycleAction(sub("past_due", days(-6)), now)).toBe("lapsed");
    expect(lifecycleAction(sub("active", days(-6)), now)).toBe("lapsed");
  });
  it("does nothing for free, partner, cancelled or paused", () => {
    expect(lifecycleAction(sub("active", days(-30), "free"), now)).toBe("none");
    expect(lifecycleAction(sub("active", days(-30), "partner"), now)).toBe("none");
    expect(lifecycleAction(sub("canceled", days(-30)), now)).toBe("none");
    expect(lifecycleAction(sub("paused", days(-30)), now)).toBe("none");
  });
});

describe("resetCreditBalance", () => {
  it("gives the allotment, and unused allotment does not roll over", () => {
    expect(resetCreditBalance(900, 1000, 0)).toBe(1000);
    expect(resetCreditBalance(0, 1000, 0)).toBe(1000);
  });
  it("carries what was bought and is still unspent", () => {
    expect(resetCreditBalance(1300, 1000, 500)).toBe(1500); // 800 allotment + 500 bought left
    expect(resetCreditBalance(300, 1000, 500)).toBe(1300); // allotment spent, 300 of the purchase left
    expect(resetCreditBalance(-5, 50, 500)).toBe(50);
  });
});

describe("monthStartUtc", () => {
  it("is the first instant of the month", () => {
    expect(monthStartUtc(new Date("2026-10-31T23:59:59Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("planNotice", () => {
  const plan = (id: string, status: string, trialEndsAt: Date | null, currentPeriodEnd: Date | null) => ({ id, status, trialEndsAt, currentPeriodEnd });
  it("counts down a trial and turns to a warning in its last 3 days", () => {
    expect(planNotice(plan("growth", "trialing", days(10), null), now)).toEqual({ tone: "info", text: "Your free Growth trial ends in 10 days." });
    expect(planNotice(plan("growth", "trialing", days(1), null), now)).toEqual({ tone: "warning", text: "Your free Growth trial ends in 1 day." });
    expect(planNotice(plan("free", "trialing", days(-1), null), now)?.text).toMatch(/trial has ended/);
  });
  it("is quiet for a healthy paid plan and for free", () => {
    expect(planNotice(plan("starter", "active", null, days(20)), now)).toBeNull();
    expect(planNotice(plan("free", "active", null, null), now)).toBeNull();
  });
  it("warns before the end, during the grace, and after the plan lapses", () => {
    expect(planNotice(plan("starter", "active", null, days(2)), now)?.text).toBe("Your plan ends in 2 days. Pay again to keep it.");
    expect(planNotice(plan("starter", "past_due", null, days(-2)), now)?.text).toMatch(/keeps working for 3 more days/);
    expect(planNotice(plan("starter", "past_due", null, days(-6)), now)?.text).toMatch(/Free plan/);
  });
});
