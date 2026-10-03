export interface ReferralOverview {
  code: string;
  terms: { pct: number; months: number };
  accruedInr: number;
  paidInr: number;
  referrals: { id: string; joinedAt: string; businessName: string; planId: string; status: string; earnedInr: number }[];
  payouts: { id: string; amountInr: number; reference: string; partnerInvoiceRef: string | null; createdAt: string }[];
}

export interface OwedRow {
  userId: string;
  email: string;
  name: string | null;
  amountInr: number;
  entries: number;
}

export interface OwedOverview {
  terms: { pct: number; months: number };
  owed: OwedRow[];
  recentPayouts: { id: string; referrerUserId: string; amountInr: number; reference: string; partnerInvoiceRef: string | null; createdAt: string }[];
}
