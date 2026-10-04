// Privacy tooling defaults (docs/ROADMAP.md Phase 3).

// Messages are kept until the workspace owner chooses otherwise.
export const MESSAGE_RETENTION_OPTIONS_DAYS = [90, 180, 365, 730] as const;

// Platform-wide, not configurable per workspace: raw Meta webhook payloads and
// webhook delivery logs contain people's details only to help debugging, so
// they don't need to live long.
export const RAW_EVENT_RETENTION_DAYS = 30;
export const WEBHOOK_DELIVERY_RETENTION_DAYS = 30;

export function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

export function isValidMessageRetention(days: number | null): boolean {
  return days === null || (MESSAGE_RETENTION_OPTIONS_DAYS as readonly number[]).includes(days);
}

// Deleting a workspace removes everything about the business's customers. The
// owner gets a window to change their mind first.
export const DELETION_GRACE_DAYS = 7;
// Invoices are kept for tax purposes after a workspace is gone (conservative:
// longer than the statutory minimum).
export const INVOICE_RETENTION_YEARS = 8;

export function deletionDueAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * 86_400_000);
}

export function invoiceRetainUntil(issuedAt: Date): Date {
  const d = new Date(issuedAt);
  d.setUTCFullYear(d.getUTCFullYear() + INVOICE_RETENTION_YEARS);
  return d;
}
