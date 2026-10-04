import type { PlanId } from "./plans";

// How a subscription ages. Payments are one-off checkouts (there is no
// recurring-billing engine), so a paid plan simply runs to `currentPeriodEnd`
// and then needs paying again.
export const TRIAL_PLAN: PlanId = "growth";
export const TRIAL_DAYS = 14;
export const RENEWAL_REMINDER_DAYS = 3; // remind this long before a paid period ends
export const RENEWAL_GRACE_DAYS = 5; // paid features keep working this long after it ends
export const CREDIT_CARRY_DAYS = 60; // bought credits last "until the end of the next billing month"

const DAY_MS = 86_400_000;

export interface SubscriptionLike {
  planId: string;
  status: string; // active | trialing | past_due | canceled | paused
  trialEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
}

const PAID_PLANS = new Set(["starter", "growth", "pro"]);

// The plan whose limits apply right now. Computed from dates rather than from a
// sweep having run, so a cancelled or lapsed workspace is limited at once even
// if the background worker is down.
export function effectivePlanId(sub: SubscriptionLike | null | undefined, now: Date = new Date()): PlanId {
  if (!sub) return "free";
  if (sub.status === "canceled") return "free";
  if (sub.status === "trialing") return sub.trialEndsAt && sub.trialEndsAt.getTime() > now.getTime() ? (sub.planId as PlanId) : "free";
  if (PAID_PLANS.has(sub.planId) && sub.currentPeriodEnd && now.getTime() >= sub.currentPeriodEnd.getTime() + RENEWAL_GRACE_DAYS * DAY_MS) return "free";
  return sub.planId as PlanId;
}

export type LifecycleAction = "none" | "trial_ended" | "renewal_reminder" | "past_due" | "lapsed";

// What the daily sweep should do about a subscription (each action is
// idempotent: it changes the state so the same action is not chosen twice,
// except the reminder, which the sweep de-duplicates).
export function lifecycleAction(sub: SubscriptionLike, now: Date = new Date()): LifecycleAction {
  if (!PAID_PLANS.has(sub.planId)) return "none";
  const t = now.getTime();
  if (sub.status === "trialing") return sub.trialEndsAt && sub.trialEndsAt.getTime() <= t ? "trial_ended" : "none";
  if (sub.status !== "active" && sub.status !== "past_due") return "none"; // canceled / paused are handled elsewhere
  if (!sub.currentPeriodEnd) return "none";
  const end = sub.currentPeriodEnd.getTime();
  if (t >= end + RENEWAL_GRACE_DAYS * DAY_MS) return "lapsed";
  if (t >= end) return sub.status === "active" ? "past_due" : "none";
  if (sub.status === "active" && end - t <= RENEWAL_REMINDER_DAYS * DAY_MS) return "renewal_reminder";
  return "none";
}

// The balance at the start of a new month, or when the plan changes: the plan's
// allotment, plus whatever was bought and is still unspent. The allotment is
// treated as spent first, so what remains of purchases is min(balance, bought).
// Unused allotment does not roll over.
export function resetCreditBalance(balance: number, allotment: number, recentlyBought: number): number {
  const carry = Math.min(Math.max(balance, 0), Math.max(recentlyBought, 0));
  return allotment + carry;
}

// First instant of the current month (UTC), the same calendar the usage tables use.
export function monthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface PlanNotice {
  tone: "info" | "warning";
  text: string;
}

// The line shown at the top of Home about the trial or an approaching or
// passed renewal date; null when there is nothing to say.
export function planNotice(sub: { id: string; status: string; trialEndsAt: Date | string | null; currentPeriodEnd: Date | string | null }, now: Date = new Date()): PlanNotice | null {
  const daysLeft = (d: Date | string | null) => (d ? Math.ceil((new Date(d).getTime() - now.getTime()) / DAY_MS) : null);
  if (sub.status === "trialing") {
    const left = daysLeft(sub.trialEndsAt);
    if (left === null || left <= 0) return { tone: "warning", text: "Your free trial has ended. You are on the Free plan." };
    return { tone: left <= 3 ? "warning" : "info", text: `Your free Growth trial ends in ${left} day${left === 1 ? "" : "s"}.` };
  }
  if (!PAID_PLANS.has(sub.id)) return null;
  const left = daysLeft(sub.currentPeriodEnd);
  if (left === null) return null;
  if (left > RENEWAL_REMINDER_DAYS) return null;
  if (left > 0) return { tone: "warning", text: `Your plan ends in ${left} day${left === 1 ? "" : "s"}. Pay again to keep it.` };
  const graceLeft = RENEWAL_GRACE_DAYS + left;
  return graceLeft > 0
    ? { tone: "warning", text: `Your plan has ended. It keeps working for ${graceLeft} more day${graceLeft === 1 ? "" : "s"}; pay to avoid dropping to Free.` }
    : { tone: "warning", text: "Your plan was not renewed, so you are on the Free plan." };
}
