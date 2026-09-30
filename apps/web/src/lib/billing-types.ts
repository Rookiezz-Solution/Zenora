export type PlanId = "free" | "starter" | "growth" | "pro" | "partner";

export interface PlanLimits {
  priceInr: number | null;
  instagramAccounts: number | null;
  users: number | null;
  aiCreditsPerMonth: number;
  contacts: number | null;
  recordingRetentionDays: number | null;
  maxRecordingMinutes: number | null;
  aiRepliesPerConversation: number;
}

export interface Subscription {
  id: string;
  workspaceId: string;
  planId: string;
  status: "active" | "trialing" | "past_due" | "canceled" | "paused";
  billingCycle: "monthly" | "yearly";
  currentPeriodEnd: string | null;
}

export interface Invoice {
  id: string;
  description: string;
  amountInr: number;
  gstInr: number;
  status: "pending" | "paid" | "failed" | "refunded";
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
}

export interface WorkspaceAddon {
  id: string;
  addonKey: string;
  quantity: number;
}

export interface BillingOverview {
  workspace: { planId: string; billingName: string | null; gstin: string | null; billingAddress: string | null };
  subscription: Subscription | null;
  invoices: Invoice[];
  addons: WorkspaceAddon[];
}

export interface UsageOverview {
  planId: PlanId;
  limits: PlanLimits;
  effectiveLimits: { contacts: number | null; users: number | null; instagramAccounts: number | null };
  usage: { contacts: number; users: number; instagramAccounts: number };
}

export interface CheckoutOrderResult {
  razorpayOrderId: string;
  description: string;
  baseInr: number;
  gstInr: number;
  totalInr: number;
}
