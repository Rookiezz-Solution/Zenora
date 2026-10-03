// Refer and earn (docs/PRD.md section 14). The PRD leaves the commission as
// placeholders ("[X]% for [N] months"); these are the defaults used until the
// business decides, and they live in one place so changing them is one edit.
export const REFERRAL_COMMISSION_PCT = 20;
export const REFERRAL_COMMISSION_MONTHS = 12;
// How long a captured referral link stays valid before the person signs up.
export const REFERRAL_ATTRIBUTION_DAYS = 30;

// No 0/O/1/I so a code read out loud or typed from a screenshot isn't ambiguous.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_LENGTH = 8;

export function normalizeReferralCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  if (code.length !== REFERRAL_CODE_LENGTH) return null;
  return [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

// `random` returns an integer in [0, max). Injected so this stays pure and the
// API can use node:crypto.
export function generateReferralCode(random: (max: number) => number): string {
  return Array.from({ length: REFERRAL_CODE_LENGTH }, () => CODE_ALPHABET[random(CODE_ALPHABET.length)]).join("");
}

// Commission on the amount before GST (GST is passed to the government, not
// revenue). Whole rupees, rounded to nearest.
export function computeCommission(baseInr: number, pct: number = REFERRAL_COMMISSION_PCT): number {
  return Math.round((baseInr * pct) / 100);
}

// Commission is earned on invoices paid within N months of the referral.
export function isWithinCommissionWindow(referredAt: Date, invoiceIssuedAt: Date, months: number = REFERRAL_COMMISSION_MONTHS): boolean {
  const end = new Date(referredAt);
  end.setUTCMonth(end.getUTCMonth() + months);
  return invoiceIssuedAt.getTime() >= referredAt.getTime() && invoiceIssuedAt.getTime() <= end.getTime();
}

// A captured link is only honoured for a limited time.
export function isReferralFresh(capturedAtMs: number, nowMs: number, days: number = REFERRAL_ATTRIBUTION_DAYS): boolean {
  return nowMs >= capturedAtMs && nowMs - capturedAtMs <= days * 86_400_000;
}
