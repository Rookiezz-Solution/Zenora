/// <reference lib="dom" />
// Public API keys and outbound webhooks (docs/ROADMAP.md Phase 3). Pure
// helpers shared by the API (validation), the worker (delivery) and the web
// (labels). Anything needing node:crypto lives in the API/worker instead, so
// this file stays safe to import from the browser bundle.

export const API_KEY_SCOPES = ["leads:read", "leads:write"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const API_KEY_PREFIX = "znr_live_";

export const WEBHOOK_EVENTS = ["lead.created", "lead.stage_changed", "appointment.booked"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "lead.created": "A new lead is created",
  "lead.stage_changed": "A lead moves to another pipeline stage",
  "appointment.booked": "A guest books an appointment"
};

// First attempt is immediate; these are the waits before each retry.
export const WEBHOOK_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000] as const;
export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_RETRY_DELAYS_MS.length + 1;

// What a webhook subscriber receives for a lead. Deliberately a small, stable
// subset — not the whole database row.
export interface LeadWebhookData {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  stageId: string | null;
  createdAt: string;
}

export function leadWebhookData(lead: {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  stageId: string | null;
  createdAt: Date;
}): LeadWebhookData {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    stageId: lead.stageId,
    createdAt: lead.createdAt.toISOString()
  };
}

// --- URL safety -----------------------------------------------------------
// Webhooks make our servers call a URL the customer typed in, so an
// unchecked URL is a way to reach things only we can reach (cloud metadata,
// Redis, the database). Literal private/loopback/link-local addresses and
// internal-looking names are refused here; the worker also resolves DNS at
// send time and re-checks every address it gets back.

function ipv4Parts(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

export function isPrivateAddress(input: string): boolean {
  let host = input.trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);

  const v4 = ipv4Parts(host);
  if (v4) {
    const [a, b] = v4 as [number, number, number, number];
    return (
      a === 0 || // "this network"
      a === 10 ||
      a === 127 || // loopback
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, incl. cloud metadata 169.254.169.254
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast and reserved
    );
  }

  if (host.includes(":")) {
    // IPv4-mapped (::ffff:10.0.0.1 or ::ffff:0a00:0001) — judge the embedded v4.
    const mapped = /^(?:0{0,4}:){0,5}ffff:(.+)$/.exec(host);
    if (mapped) {
      const tail = mapped[1]!;
      const dotted = ipv4Parts(tail);
      if (dotted) return isPrivateAddress(tail);
      const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail);
      if (hex) {
        const hi = parseInt(hex[1]!, 16);
        const lo = parseInt(hex[2]!, 16);
        return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
      }
      return true;
    }
    return (
      host === "::" ||
      host === "::1" ||
      /^f[cd][0-9a-f]{2}:/.test(host) || // unique local fc00::/7
      /^fe[89ab][0-9a-f]:/.test(host) || // link-local fe80::/10
      host.startsWith("ff") // multicast
    );
  }

  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".") // bare names like "redis" or "metadata"
  );
}

export type WebhookUrlCheck = { ok: true; url: string } | { ok: false; reason: string };

export function checkWebhookUrl(raw: string, options: { allowPrivate?: boolean } = {}): WebhookUrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Enter a full URL, e.g. https://example.com/zenora-webhook" };
  }
  if (url.username || url.password) return { ok: false, reason: "Put credentials in a header or the signing secret, not in the URL" };
  if (options.allowPrivate) {
    if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "The URL must start with http:// or https://" };
    return { ok: true, url: url.toString() };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "The URL must use https://" };
  if (isPrivateAddress(url.hostname)) return { ok: false, reason: "That address is private or internal. Use a public https URL." };
  return { ok: true, url: url.toString() };
}
