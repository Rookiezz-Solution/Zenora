export type IntegrationStatus = "configured" | "partial" | "missing" | "coming_soon";

export interface AdminIntegrationField {
  key: string;
  label: string;
  secret: boolean;
  help: string | null;
  configured: boolean;
  source: "dashboard" | "env" | "none";
  value: string | null; // null for secrets, always
}

export interface AdminIntegrationGroup {
  id: string;
  title: string;
  description: string;
  status: IntegrationStatus;
  restartRequired: boolean;
  setupLinks: { label: string; url: string }[];
  fields: AdminIntegrationField[];
}

export interface AdminSummary {
  workspaces: number;
  users: number;
  byPlan: Record<string, number>;
  mrrInr: number;
  windowDays: number;
  revenueInr: number;
  costInr: number;
  marginInr: number;
  marginPct: number | null;
}

export interface AdminWorkspaceRow {
  id: string;
  name: string;
  createdAt: string;
  planId: string;
  status: string;
  members: number;
  contacts: number;
  hasOverride: boolean;
  creditsUsed: number;
  revenueInr: number;
  costInr: number;
  marginInr: number;
  marginPct: number | null;
}

export interface LimitOverrides {
  contacts: number | null;
  users: number | null;
  instagramAccounts: number | null;
}

export interface AdminWorkspaceDetail {
  id: string;
  name: string;
  createdAt: string;
  timezone: string;
  planId: string;
  subscription: { planId: string; status: string; billingCycle: string; currentPeriodEnd: string | null } | null;
  owners: { email: string; name: string | null }[];
  plan: { priceInr: number | null; contacts: number | null; users: number | null; instagramAccounts: number | null; aiCreditsPerMonth: number };
  effectiveLimits: LimitOverrides;
  current: { contacts: number; users: number; instagramAccounts: number; aiCreditsRemaining: number };
  override: (LimitOverrides & { note: string | null; updatedAt: string }) | null;
  usageByType: { type: string; quantity: number }[];
  windowDays: number;
  revenueInr: number;
  costInr: number;
  marginInr: number;
  marginPct: number | null;
  audit: { id: string; action: string; detail: string | null; createdAt: string }[];
}

export const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
export const limitText = (n: number | null) => (n === null ? "Unlimited" : n.toLocaleString("en-IN"));
