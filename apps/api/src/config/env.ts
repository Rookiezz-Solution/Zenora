import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  API_URL: z.string().url().default("http://localhost:4000"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  SESSION_COOKIE_NAME: z.string().default("zenora_session"),
  // 32-byte hex key for AES-256-GCM (encrypts channel access tokens at rest).
  // Generate with: openssl rand -hex 32
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  OTP_PROVIDER_API_KEY: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default("v21.0"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL_VOLUME: z.string().default("claude-haiku-4-5-20251001"),
  AI_MODEL_SUMMARY: z.string().default("claude-sonnet-5-5"),
  META_WHATSAPP_CONFIG_ID: z.string().optional(),
  WHATSAPP_TECH_PROVIDER_ID: z.string().optional(),
  // Comma-separated emails allowed into the super admin dashboard. Env-only
  // on purpose: it can never be changed from the UI, so nobody can promote
  // themselves. Empty means nobody is a super admin.
  SUPER_ADMIN_EMAILS: z.string().optional(),
  // Local development only: lets webhooks target localhost/private addresses.
  // Never set in production — it turns off the check that stops a webhook URL
  // from reaching internal services.
  WEBHOOK_ALLOW_PRIVATE: z.string().optional()
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

// Values set from the super admin dashboard. They win over .env, so every
// existing loadEnv() call site picks them up without any change.
let overrides: Record<string, string> = {};

export function setRuntimeOverrides(next: Record<string, string>): void {
  overrides = next;
}

// Where a key's effective value comes from — for the admin dashboard.
export function envSource(key: string): "dashboard" | "env" | "none" {
  if (overrides[key]) return "dashboard";
  loadEnv();
  return (cached as Record<string, unknown> | undefined)?.[key] ? "env" : "none";
}

function withOverrides(base: Env): Env {
  return Object.keys(overrides).length === 0 ? base : ({ ...base, ...overrides } as Env);
}

// Fails fast on boot rather than surfacing missing-config bugs at request
// time — cheaper to debug a crash on `pnpm dev` than a 500 in the inbox.
export function loadEnv(): Env {
  if (cached) return withOverrides(cached);
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }
  cached = parsed.data;
  return withOverrides(cached);
}
