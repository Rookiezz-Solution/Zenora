// Booking reminders: pure helpers shared by the API (validation) and the
// worker (sending).

export const REMINDER_HOUR_OPTIONS = [1, 2, 4, 12, 24, 48] as const;
export const MAX_REMINDER_HOURS = 72;
export const MAX_TEMPLATE_VARIABLES = 5;

// WhatsApp templates use {{1}}, {{2}}… — Meta rejects a send whose number of
// parameters differs from the body's highest placeholder.
export function templateVariableCount(bodyText: string): number {
  let max = 0;
  for (const m of bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

export interface ReminderVariables {
  guestName: string;
  when: string;
  service: string;
}

// {{1}} guest name, {{2}} date and time, {{3}} appointment type; anything
// beyond that is filled with "-" so the send still matches the template.
export function buildReminderParams(bodyText: string, vars: ReminderVariables): string[] {
  const values = [vars.guestName, vars.when, vars.service];
  return Array.from({ length: templateVariableCount(bodyText) }, (_, i) => values[i] ?? "-");
}

export function formatAppointmentTime(startsAtMs: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(new Date(startsAtMs));
}

export interface ReminderCandidate {
  startsAtMs: number;
  createdAtMs: number;
  hoursBefore: number;
}

// Due once we are inside the reminder window and the appointment hasn't
// started. A booking made *inside* the window gets no reminder — the guest
// has only just been told about it.
export function isReminderDue(c: ReminderCandidate, nowMs: number): boolean {
  const remindAtMs = c.startsAtMs - c.hoursBefore * 3_600_000;
  if (nowMs < remindAtMs || nowMs >= c.startsAtMs) return false;
  return c.createdAtMs < remindAtMs;
}
