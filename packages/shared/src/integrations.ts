// Platform integrations a super admin configures from the admin dashboard
// instead of editing .env. Only third-party credentials live here — the
// secrets that protect the platform itself (DATABASE_URL, AUTH_SECRET,
// TOKEN_ENCRYPTION_KEY, REDIS_URL, ...) deliberately stay in the environment.

export interface IntegrationField {
  key: string;
  label: string;
  secret: boolean; // write-only: never sent back to the browser
  public?: boolean; // safe to hand to the browser (e.g. an OAuth client/app id)
  help?: string;
}

export interface SetupLink {
  label: string;
  path: string; // appended to the API's public URL
}

export interface IntegrationGroup {
  id: string;
  title: string;
  description: string;
  fields: IntegrationField[];
  required: string[]; // keys that must all be set for the group to count as configured
  setupLinks?: SetupLink[];
  restartRequired?: boolean; // some keys are only read when the API starts
  comingSoon?: boolean;
}

export const INTEGRATION_GROUPS: IntegrationGroup[] = [
  {
    id: "google",
    title: "Google",
    description: "Google Calendar (booking and calendar sync) and Sign in with Google.",
    fields: [
      { key: "GOOGLE_CLIENT_ID", label: "OAuth client ID", secret: false },
      { key: "GOOGLE_CLIENT_SECRET", label: "OAuth client secret", secret: true }
    ],
    required: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    setupLinks: [
      { label: "Authorized redirect URI (Calendar)", path: "/calendar/google/callback" },
      { label: "Authorized redirect URI (Sign in)", path: "/auth/google/callback" }
    ],
    restartRequired: true
  },
  {
    id: "meta",
    title: "Meta (Instagram, WhatsApp, Ads)",
    description: "One Meta app powers Instagram DMs, WhatsApp Cloud API and Meta Ads (ads_read for spend and attribution).",
    fields: [
      { key: "META_APP_ID", label: "App ID", secret: false, public: true },
      { key: "META_APP_SECRET", label: "App secret", secret: true },
      { key: "META_WEBHOOK_VERIFY_TOKEN", label: "Webhook verify token", secret: true, help: "Any random string; paste the same value into Meta's webhook settings." },
      { key: "META_WHATSAPP_CONFIG_ID", label: "WhatsApp Embedded Signup config ID", secret: false, public: true },
      { key: "WHATSAPP_TECH_PROVIDER_ID", label: "WhatsApp Tech Provider ID", secret: false }
    ],
    required: ["META_APP_ID", "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN"],
    setupLinks: [
      { label: "Instagram OAuth redirect URI", path: "/channels/instagram/callback" },
      { label: "Ads OAuth redirect URI", path: "/ads/meta/callback" },
      { label: "Webhook callback URL", path: "/webhooks/meta" }
    ]
  },
  {
    id: "razorpay",
    title: "Razorpay",
    description: "Payments for plans, add-ons and AI credit top-ups.",
    fields: [
      { key: "RAZORPAY_KEY_ID", label: "Key ID", secret: false, public: true },
      { key: "RAZORPAY_KEY_SECRET", label: "Key secret", secret: true },
      { key: "RAZORPAY_WEBHOOK_SECRET", label: "Webhook secret", secret: true }
    ],
    required: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
    setupLinks: [{ label: "Webhook URL", path: "/webhooks/razorpay" }]
  },
  {
    id: "anthropic",
    title: "Anthropic (AI)",
    description: "AI answers, lead scoring, suggested replies and FAQ generation.",
    fields: [
      { key: "ANTHROPIC_API_KEY", label: "API key", secret: true },
      { key: "AI_MODEL_VOLUME", label: "Model for everyday replies", secret: false, help: "Leave empty to use the built-in default." },
      { key: "AI_MODEL_SUMMARY", label: "Model for summaries", secret: false, help: "Leave empty to use the built-in default." }
    ],
    required: ["ANTHROPIC_API_KEY"]
  },
  {
    id: "sms",
    title: "SMS / OTP",
    description: "Login verification codes (MSG91 or similar, DLT registered).",
    fields: [{ key: "OTP_PROVIDER_API_KEY", label: "Provider API key", secret: true }],
    required: ["OTP_PROVIDER_API_KEY"]
  },
  {
    id: "telephony",
    title: "Telephony",
    description: "Click-to-call, recordings and masked numbers. Paused.",
    fields: [],
    required: [],
    comingSoon: true
  },
  {
    id: "speech",
    title: "Speech-to-text and meeting bot",
    description: "Call transcripts and meeting notes. Paused.",
    fields: [],
    required: [],
    comingSoon: true
  },
  {
    id: "google_ads",
    title: "Google Ads",
    description: "Ads attribution for Google. Meta comes first.",
    fields: [],
    required: [],
    comingSoon: true
  }
];

export const INTEGRATION_KEYS: string[] = INTEGRATION_GROUPS.flatMap((g) => g.fields.map((f) => f.key));

export function findIntegrationField(key: string): IntegrationField | undefined {
  return INTEGRATION_GROUPS.flatMap((g) => g.fields).find((f) => f.key === key);
}

export type IntegrationStatus = "configured" | "partial" | "missing" | "coming_soon";

// `isSet` says whether a key currently has a usable value (dashboard or env).
export function groupStatus(group: IntegrationGroup, isSet: (key: string) => boolean): IntegrationStatus {
  if (group.comingSoon) return "coming_soon";
  if (group.required.length === 0) return group.fields.some((f) => isSet(f.key)) ? "configured" : "missing";
  if (group.required.every(isSet)) return "configured";
  // Optional extras (e.g. model names that have built-in defaults) don't
  // count as progress — only required keys do.
  return group.required.some(isSet) ? "partial" : "missing";
}
