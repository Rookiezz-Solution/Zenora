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
