// Sharing flow templates beyond one workspace (docs/ROADMAP.md Phase 3: public
// template gallery). A template can be private, shared with the owner's agency,
// or — after a super admin approves it — public to everyone.

export const TEMPLATE_SCOPES = ["private", "agency", "public"] as const;
export type TemplateScope = (typeof TEMPLATE_SCOPES)[number];

export const PUBLISH_STATUSES = ["pending", "approved", "rejected"] as const;
export type PublishStatus = (typeof PUBLISH_STATUSES)[number];

// Where a template the caller can see comes from, for labelling. Never reveals
// which workspace made a community template.
export type TemplateOrigin = "mine" | "agency" | "community" | "zenora";

export interface PersonalDataIssue {
  kind: "email" | "phone";
  // A masked sample so the author can find it without it being echoed in full.
  sample: string;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// A run of 8+ digits, allowing spaces, dashes, dots, brackets and a leading +.
const PHONE = /(?<![\w{])\+?\d(?:[\s().-]?\d){7,}(?![\w}])/g;

function mask(text: string): string {
  return text.length <= 4 ? "••••" : `${text.slice(0, 2)}${"•".repeat(Math.max(2, text.length - 4))}${text.slice(-2)}`;
}

// Everything a lead or the business owner could read in a graph: every string
// value, wherever it sits, but not the object keys (block ids and wiring).
export function collectTemplateText(graph: unknown): string[] {
  const out: string[] = [];
  collectText(graph, out);
  return out;
}

function collectText(value: unknown, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectText(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) collectText(v, out);
}

// A published template is copied by strangers, so it must not carry anyone's
// phone number or email address. {placeholders} are fine — they are filled in
// from the workspace that uses the template.
export function findPersonalData(graph: unknown): PersonalDataIssue[] {
  const texts: string[] = [];
  collectText(graph, texts);
  const issues: PersonalDataIssue[] = [];
  for (const text of texts) {
    for (const m of text.matchAll(EMAIL)) issues.push({ kind: "email", sample: mask(m[0]) });
    for (const m of text.replace(EMAIL, " ").matchAll(PHONE)) issues.push({ kind: "phone", sample: mask(m[0].trim()) });
  }
  return issues;
}

export function templateOrigin(input: { workspaceId: string | null; scope: string }, viewerWorkspaceId: string): TemplateOrigin {
  if (input.workspaceId === viewerWorkspaceId) return "mine";
  if (input.workspaceId === null) return "zenora";
  return input.scope === "agency" ? "agency" : "community";
}
