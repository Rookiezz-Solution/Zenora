// Mirrors docs/PLANS_AND_LIMITS.md. Editable defaults — the owner console can
// override per-workspace limits at runtime; these are the shipped defaults.

export const PLAN_IDS = ["free", "starter", "growth", "pro", "partner"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

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

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    priceInr: 0,
    instagramAccounts: 1,
    users: 1,
    aiCreditsPerMonth: 50,
    contacts: 1000,
    recordingRetentionDays: null,
    maxRecordingMinutes: null,
    aiRepliesPerConversation: 20
  },
  starter: {
    priceInr: 1499,
    instagramAccounts: 1,
    users: 2,
    aiCreditsPerMonth: 1000,
    contacts: 5000,
    recordingRetentionDays: 30,
    maxRecordingMinutes: 30,
    aiRepliesPerConversation: 20
  },
  growth: {
    priceInr: 3999,
    instagramAccounts: 2,
    users: 5,
    aiCreditsPerMonth: 3000,
    contacts: 25000,
    recordingRetentionDays: 90,
    maxRecordingMinutes: 60,
    aiRepliesPerConversation: 20
  },
  pro: {
    priceInr: 8999,
    instagramAccounts: 5,
    users: 15,
    aiCreditsPerMonth: 7000,
    contacts: 100000,
    recordingRetentionDays: 365,
    maxRecordingMinutes: 120,
    aiRepliesPerConversation: 30
  },
  partner: {
    priceInr: null,
    instagramAccounts: null,
    users: null,
    aiCreditsPerMonth: 0,
    contacts: null,
    recordingRetentionDays: null,
    maxRecordingMinutes: null,
    aiRepliesPerConversation: 0
  }
};

// 1 credit ≈ ₹0.25 of provider cost.
export const CREDIT_WEIGHTS = {
  aiReply: 1,
  callMinuteTranscribedAndSummarised: 3,
  meetingMinute: 6
} as const;

export const ADDON_PRICES_INR = {
  extraUser: 399,
  extraInstagramAccount: 699,
  extra25kContacts: 499
} as const;

export const TOPUP_PRICES_INR = {
  credits1000: 799,
  credits3000: 2199,
  credits10000: 6499
} as const;

export const USAGE_ALERT_THRESHOLDS = [0.5, 0.8, 1.0] as const;

// Owner console flags workspaces whose variable cost exceeds this share of
// plan price.
export const TARGET_MAX_VARIABLE_COST_RATIO = 0.3;
