// Numbers shown on the Home dashboard. Pure, so they can be tested without a
// database.

export interface ThreadMessage {
  direction: "inbound" | "outbound";
  createdAt: Date | string;
}

// How long a new enquiry waited for a first reply: from the first inbound
// message to the first outbound message after it. A thread nobody has answered
// yet has no figure (it is counted separately as "waiting").
export function firstResponseMinutes(messages: ThreadMessage[]): number | null {
  const sorted = [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const firstInbound = sorted.find((m) => m.direction === "inbound");
  if (!firstInbound) return null;
  const reply = sorted.find((m) => m.direction === "outbound" && new Date(m.createdAt).getTime() >= new Date(firstInbound.createdAt).getTime());
  if (!reply) return null;
  return (new Date(reply.createdAt).getTime() - new Date(firstInbound.createdAt).getTime()) / 60_000;
}

// The median, not the average: one enquiry left overnight shouldn't make a
// team that answers in minutes look slow.
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function medianSpeedToLeadMinutes(threads: ThreadMessage[][]): number | null {
  const times = threads.map(firstResponseMinutes).filter((n): n is number => n !== null);
  const m = median(times);
  return m === null ? null : Math.round(m * 10) / 10;
}

// A thread is "waiting" when the customer spoke last and nobody has replied.
export function isWaitingForReply(messages: ThreadMessage[]): boolean {
  if (messages.length === 0) return false;
  const last = messages.reduce((a, b) => (new Date(b.createdAt).getTime() >= new Date(a.createdAt).getTime() ? b : a));
  return last.direction === "inbound";
}

// Percentage change against the previous period; null when there is nothing to
// compare with (a jump from 0 isn't a percentage).
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return hours < 48 ? `${Math.round(hours * 10) / 10} h` : `${Math.round(hours / 24)} days`;
}
