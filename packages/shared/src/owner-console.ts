// Owner console maths: what a workspace is worth to the platform. Pure, so it
// can be tested without a database.
import { getPlanConfig } from "./plan-config";
import { YEARLY_MONTHS_CHARGED, type PlanId } from "./plans";

// docs: "1 credit ≈ ₹0.25 of provider cost" (see CREDIT_WEIGHTS in plans.ts).
export const CREDIT_PROVIDER_COST_INR = 0.25;

// What a subscription is worth per month, before GST. A yearly customer pays
// YEARLY_MONTHS_CHARGED months up front, so spread that over twelve. Only an
// active paid subscription counts (a trial or lapsed one is worth nothing yet).
export function monthlyRecurringRevenueInr(planId: PlanId, billingCycle: string, status: string): number {
  if (status !== "active") return 0;
  const price = getPlanConfig().plans[planId].priceInr;
  if (!price) return 0;
  return billingCycle === "yearly" ? Math.round((price * YEARLY_MONTHS_CHARGED) / 12) : price;
}

export interface Economics {
  revenueInr: number;
  costInr: number;
  marginInr: number;
  // null when there is no revenue to take a percentage of.
  marginPct: number | null;
}

// Cash basis over a window: paid invoices (ex-GST) minus AI provider cost for
// the credits spent in it. Provider costs other than AI (transcription,
// meetings) aren't tracked yet, so this flatters call-heavy workspaces.
export function estimateEconomics(input: { paidInvoicesInr: number; creditsUsed: number }): Economics {
  const costInr = Math.round(input.creditsUsed * CREDIT_PROVIDER_COST_INR * 100) / 100;
  const marginInr = Math.round((input.paidInvoicesInr - costInr) * 100) / 100;
  return {
    revenueInr: input.paidInvoicesInr,
    costInr,
    marginInr,
    marginPct: input.paidInvoicesInr > 0 ? Math.round((marginInr / input.paidInvoicesInr) * 1000) / 10 : null
  };
}

// Limits the owner can override per workspace. null = no override (use the
// plan plus any add-ons).
export const OVERRIDABLE_LIMITS = ["contacts", "users", "instagramAccounts"] as const;
export type OverridableLimit = (typeof OVERRIDABLE_LIMITS)[number];
export type LimitOverrides = Record<OverridableLimit, number | null>;

export function describeLimitChange(before: LimitOverrides, after: LimitOverrides): string {
  const parts = OVERRIDABLE_LIMITS.filter((k) => before[k] !== after[k]).map((k) => `${k}: ${before[k] ?? "plan default"} → ${after[k] ?? "plan default"}`);
  return parts.length ? parts.join(", ") : "no change";
}
