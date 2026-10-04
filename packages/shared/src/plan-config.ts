// Runtime plan configuration: the shipped defaults (plans.ts) plus anything a
// super admin has changed from the owner console. Every piece of code that needs
// a price or a limit reads it through getPlanConfig() so a change takes effect
// everywhere at once, and nothing is hard-wired to the constants.
import { ADDON_PRICES_INR, PLAN_IDS, PLAN_LIMITS, TOPUP_PRICES_INR, type PlanId, type PlanLimits } from "./plans";

export type AddonKey = keyof typeof ADDON_PRICES_INR;
export type TopupKey = keyof typeof TOPUP_PRICES_INR;

export interface PlanConfig {
  plans: Record<PlanId, PlanLimits>;
  addonPrices: Record<AddonKey, number>;
  topupPrices: Record<TopupKey, number>;
}

// Only these can be changed. Free and Partner are not editable, and what a
// top-up *contains* (credits per pack) is not a price, so it isn't either.
export const EDITABLE_PLAN_IDS = ["starter", "growth", "pro"] as const satisfies readonly PlanId[];
export const EDITABLE_PLAN_FIELDS = ["priceInr", "users", "instagramAccounts", "contacts", "aiCreditsPerMonth"] as const;
export type EditablePlanField = (typeof EDITABLE_PLAN_FIELDS)[number];
// Lowering one of these can leave existing customers over their limit.
export const LIMIT_FIELDS = ["users", "instagramAccounts", "contacts"] as const;

export interface PlanConfigOverrides {
  plans?: Partial<Record<PlanId, Partial<Pick<PlanLimits, EditablePlanField>>>>;
  addonPrices?: Partial<Record<AddonKey, number>>;
  topupPrices?: Partial<Record<TopupKey, number>>;
}

export const DEFAULT_PLAN_CONFIG: PlanConfig = {
  plans: PLAN_LIMITS,
  addonPrices: { ...ADDON_PRICES_INR },
  topupPrices: { ...TOPUP_PRICES_INR }
};

export function applyPlanOverrides(base: PlanConfig, overrides: PlanConfigOverrides | null | undefined): PlanConfig {
  const plans = Object.fromEntries(PLAN_IDS.map((id) => [id, { ...base.plans[id], ...(EDITABLE_PLAN_IDS.includes(id as never) ? (overrides?.plans?.[id] ?? {}) : {}) }])) as Record<PlanId, PlanLimits>;
  return { plans, addonPrices: { ...base.addonPrices, ...(overrides?.addonPrices ?? {}) }, topupPrices: { ...base.topupPrices, ...(overrides?.topupPrices ?? {}) } };
}

// --- the live configuration (one per process) ------------------------------
let current: PlanConfig = DEFAULT_PLAN_CONFIG;

export function getPlanConfig(): PlanConfig {
  return current;
}
export function setPlanConfig(config: PlanConfig): void {
  current = config;
}

// --- validation --------------------------------------------------------------
const RANGES: Record<EditablePlanField, [number, number]> = {
  priceInr: [99, 100_000],
  users: [1, 1_000],
  instagramAccounts: [1, 100],
  contacts: [100, 10_000_000],
  aiCreditsPerMonth: [0, 1_000_000]
};
const ADDON_RANGE: [number, number] = [1, 50_000];
const TOPUP_RANGE: [number, number] = [1, 500_000];

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

// Returns human-readable problems; an empty list means the overrides are sane.
export function validatePlanOverrides(overrides: PlanConfigOverrides): string[] {
  const issues: string[] = [];
  for (const [planId, fields] of Object.entries(overrides.plans ?? {})) {
    if (!EDITABLE_PLAN_IDS.includes(planId as never)) {
      issues.push(`The ${planId} plan can't be edited.`);
      continue;
    }
    for (const [field, value] of Object.entries(fields ?? {})) {
      const range = RANGES[field as EditablePlanField];
      if (!range) issues.push(`${planId}: "${field}" can't be edited.`);
      else if (!isInt(value) || value < range[0] || value > range[1]) issues.push(`${planId} ${field} must be a whole number from ${range[0].toLocaleString("en-IN")} to ${range[1].toLocaleString("en-IN")}.`);
    }
  }
  for (const [name, value] of Object.entries(overrides.addonPrices ?? {})) {
    if (!(name in ADDON_PRICES_INR)) issues.push(`Unknown add-on "${name}".`);
    else if (!isInt(value) || value < ADDON_RANGE[0] || value > ADDON_RANGE[1]) issues.push(`Add-on ${name} must be a whole number of rupees from ${ADDON_RANGE[0]} to ${ADDON_RANGE[1].toLocaleString("en-IN")}.`);
  }
  for (const [name, value] of Object.entries(overrides.topupPrices ?? {})) {
    if (!(name in TOPUP_PRICES_INR)) issues.push(`Unknown top-up "${name}".`);
    else if (!isInt(value) || value < TOPUP_RANGE[0] || value > TOPUP_RANGE[1]) issues.push(`Top-up ${name} must be a whole number of rupees from ${TOPUP_RANGE[0]} to ${TOPUP_RANGE[1].toLocaleString("en-IN")}.`);
  }
  return issues;
}

// Checks the finished configuration, not just each number on its own: a bigger
// plan must not cost less, or hold less, than the one below it.
export function validatePlanConfig(config: PlanConfig): string[] {
  const issues: string[] = [];
  const [a, b, c] = EDITABLE_PLAN_IDS.map((id) => config.plans[id]) as [PlanLimits, PlanLimits, PlanLimits];
  const tiers: [string, PlanLimits, PlanLimits][] = [["Starter", a, b], ["Growth", b, c]];
  for (const [name, lower, higher] of tiers) {
    const label = name === "Starter" ? "Growth" : "Pro";
    if ((higher.priceInr ?? 0) <= (lower.priceInr ?? 0)) issues.push(`${label} must cost more than ${name}.`);
    for (const f of [...LIMIT_FIELDS, "aiCreditsPerMonth"] as const) {
      if ((higher[f] ?? Infinity) < (lower[f] ?? Infinity)) issues.push(`${label} must not allow fewer ${f === "aiCreditsPerMonth" ? "AI credits" : f} than ${name}.`);
    }
  }
  return issues;
}

// A price move this big needs an explicit second confirmation.
export const LARGE_PRICE_CHANGE_RATIO = 0.25;

export interface PlanChange {
  label: string;
  before: number | null;
  after: number | null;
}

export function diffPlanConfig(before: PlanConfig, after: PlanConfig): PlanChange[] {
  const changes: PlanChange[] = [];
  for (const id of EDITABLE_PLAN_IDS) {
    for (const f of EDITABLE_PLAN_FIELDS) {
      if (before.plans[id][f] !== after.plans[id][f]) changes.push({ label: `${id} ${f}`, before: before.plans[id][f] as number | null, after: after.plans[id][f] as number | null });
    }
  }
  for (const k of Object.keys(before.addonPrices) as AddonKey[]) if (before.addonPrices[k] !== after.addonPrices[k]) changes.push({ label: `add-on ${k}`, before: before.addonPrices[k], after: after.addonPrices[k] });
  for (const k of Object.keys(before.topupPrices) as TopupKey[]) if (before.topupPrices[k] !== after.topupPrices[k]) changes.push({ label: `top-up ${k}`, before: before.topupPrices[k], after: after.topupPrices[k] });
  return changes;
}

export function isLargePriceChange(change: PlanChange): boolean {
  const isPrice = change.label.endsWith("priceInr") || change.label.startsWith("add-on") || change.label.startsWith("top-up");
  return isPrice && !!change.before && change.after !== null && Math.abs(change.after - change.before) / change.before > LARGE_PRICE_CHANGE_RATIO;
}

export function isLimitDecrease(change: PlanChange): boolean {
  const field = change.label.split(" ")[1];
  return (LIMIT_FIELDS as readonly string[]).includes(field ?? "") && change.after !== null && change.before !== null && change.after < change.before;
}

export function describePlanChanges(changes: PlanChange[]): string {
  return changes.length ? changes.map((c) => `${c.label}: ${c.before ?? "unlimited"} → ${c.after ?? "unlimited"}`).join(", ") : "no change";
}
