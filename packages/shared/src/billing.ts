// Pure checkout pricing — no DB, no Razorpay — so the GST/yearly-discount
// math can be unit tested without mocking anything (docs/ROADMAP.md Phase 1
// item 9). The API wraps this with the actual order creation + persistence.
import { ADDON_PRICES_INR, GST_RATE, PLAN_LABELS, PLAN_LIMITS, TOPUP_PRICES_INR, YEARLY_MONTHS_CHARGED, type PlanId } from "./plans";

export interface CheckoutAmount {
  description: string;
  baseInr: number;
  gstInr: number;
  totalInr: number;
}

export type CheckoutIntent =
  | { kind: "plan"; planId: PlanId; billingCycle: "monthly" | "yearly" }
  | { kind: "addon"; addonKey: keyof typeof ADDON_PRICES_INR; quantity: number }
  | { kind: "topup"; topupKey: keyof typeof TOPUP_PRICES_INR };

export function computeCheckoutAmount(intent: CheckoutIntent): CheckoutAmount {
  let baseInr: number;
  let description: string;

  if (intent.kind === "plan") {
    const price = PLAN_LIMITS[intent.planId].priceInr;
    if (price === null) throw new Error(`Plan ${intent.planId} has no self-serve price`);
    baseInr = intent.billingCycle === "yearly" ? price * YEARLY_MONTHS_CHARGED : price;
    description = `${PLAN_LABELS[intent.planId]} plan — ${intent.billingCycle}`;
  } else if (intent.kind === "addon") {
    baseInr = ADDON_PRICES_INR[intent.addonKey] * intent.quantity;
    description = `${intent.addonKey} × ${intent.quantity}`;
  } else {
    baseInr = TOPUP_PRICES_INR[intent.topupKey];
    description = `${intent.topupKey.replace("credits", "")} AI credits top-up`;
  }

  const gstInr = Math.round(baseInr * GST_RATE);
  return { description, baseInr, gstInr, totalInr: baseInr + gstInr };
}
