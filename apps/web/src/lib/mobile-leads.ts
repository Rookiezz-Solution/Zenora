export interface MobileLead {
  id: string;
  name: string | null;
  phone: string | null;
  source: string | null;
  score: number;
  stage: { name: string } | null;
  tags: { tag: { name: string } }[];
  tasks: { id: string; title: string; dueAt: string | null }[];
}

export type MobileFilter = "all" | "due_now" | "today" | "overdue";
export type DueBucket = "overdue" | "due_now" | "today" | "later" | "none";

export function dueBucket(dueAt: string | null | undefined, now = new Date()): DueBucket {
  if (!dueAt) return "none";
  const due = new Date(dueAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);
  if (due < startOfToday) return "overdue";
  if (due <= now) return "due_now";
  if (due < startOfTomorrow) return "today";
  return "later";
}

// "Due now" includes anything already past due, matching the design's
// "1 due now" pill sitting alongside Today and Overdue.
export function matchesFilter(lead: MobileLead, filter: MobileFilter, now = new Date()): boolean {
  if (filter === "all") return true;
  const bucket = dueBucket(lead.tasks[0]?.dueAt, now);
  if (filter === "overdue") return bucket === "overdue";
  if (filter === "today") return bucket === "today" || bucket === "due_now";
  return bucket === "due_now" || bucket === "overdue";
}

export function digitsOnly(phone: string | null): string | null {
  const d = phone?.replace(/\D/g, "") ?? "";
  return d.length > 0 ? d : null;
}
