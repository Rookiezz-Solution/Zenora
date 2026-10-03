import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  REFERRAL_COMMISSION_MONTHS,
  REFERRAL_COMMISSION_PCT,
  computeCommission,
  generateReferralCode,
  isWithinCommissionWindow,
  normalizeReferralCode
} from "@zenora/shared";
import * as crypto from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Every user has one code, made the first time they ask for it.
  async myCode(userId: string) {
    const existing = await this.prisma.client.referralCode.findUnique({ where: { userId } });
    if (existing) return existing.code;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateReferralCode((max) => crypto.randomInt(max));
      try {
        return (await this.prisma.client.referralCode.create({ data: { userId, code } })).code;
      } catch {
        // Lost a race for the same user, or a (very unlikely) code clash: re-read, else retry.
        const again = await this.prisma.client.referralCode.findUnique({ where: { userId } });
        if (again) return again.code;
      }
    }
    throw new BadRequestException("Could not create a referral code, please try again");
  }

  // Called when a workspace is created. Never throws and never reveals why a
  // code was ignored: a bad, self-owned or already-used code must not get in the
  // way of making a workspace, or let someone probe which codes exist.
  async attribute(workspaceId: string, creatorUserId: string, rawCode: string | undefined): Promise<void> {
    try {
      const code = rawCode ? normalizeReferralCode(rawCode) : null;
      if (!code) return;
      const owner = await this.prisma.client.referralCode.findUnique({ where: { code } });
      if (!owner || owner.userId === creatorUserId) return; // unknown code, or referring yourself
      await this.prisma.client.referral.create({ data: { referrerUserId: owner.userId, referredWorkspaceId: workspaceId, code } });
    } catch (err) {
      this.logger.warn(`Referral not recorded: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Called after a payment is applied. Idempotent: the unique invoiceId means a
  // webhook and a client callback for the same payment can't pay twice.
  async accrueForPayment(razorpayPaymentId: string): Promise<void> {
    try {
      const invoice = await this.prisma.client.invoice.findUnique({ where: { razorpayPaymentId } });
      if (!invoice || invoice.status !== "paid") return;
      const referral = await this.prisma.client.referral.findUnique({ where: { referredWorkspaceId: invoice.workspaceId } });
      if (!referral) return;
      if (referral.referrerUserId && (await this.isMember(referral.referrerUserId, invoice.workspaceId))) return; // never earn on your own workspace
      if (!isWithinCommissionWindow(referral.createdAt, invoice.issuedAt, REFERRAL_COMMISSION_MONTHS)) return;
      const exists = await this.prisma.client.commissionEntry.findUnique({ where: { invoiceId: invoice.id } });
      if (exists) return;

      await this.prisma.client.commissionEntry.create({
        data: {
          referralId: referral.id,
          invoiceId: invoice.id,
          baseInr: invoice.amountInr,
          pct: REFERRAL_COMMISSION_PCT,
          amountInr: computeCommission(invoice.amountInr, REFERRAL_COMMISSION_PCT)
        }
      });
    } catch (err) {
      // A commission bookkeeping problem must never fail the customer's payment.
      this.logger.error(`Could not accrue commission for payment ${razorpayPaymentId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // What a referrer sees about their own programme. Referred businesses show as
  // name and plan only — nothing about their data.
  async overview(userId: string) {
    const code = await this.myCode(userId);
    const [referrals, entries, payouts] = await Promise.all([
      this.prisma.client.referral.findMany({
        where: { referrerUserId: userId },
        select: { id: true, createdAt: true, referredWorkspace: { select: { name: true, subscription: { select: { planId: true, status: true } } } } },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.client.commissionEntry.findMany({ where: { referral: { referrerUserId: userId } }, select: { referralId: true, amountInr: true, status: true } }),
      this.prisma.client.payout.findMany({ where: { referrerUserId: userId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, amountInr: true, reference: true, partnerInvoiceRef: true, createdAt: true } })
    ]);

    const sum = (status: string, referralId?: string) => entries.filter((e) => e.status === status && (!referralId || e.referralId === referralId)).reduce((n, e) => n + e.amountInr, 0);
    return {
      code,
      terms: { pct: REFERRAL_COMMISSION_PCT, months: REFERRAL_COMMISSION_MONTHS },
      accruedInr: sum("accrued"),
      paidInr: sum("paid"),
      referrals: referrals.map((r) => ({
        id: r.id,
        joinedAt: r.createdAt,
        businessName: r.referredWorkspace.name,
        planId: r.referredWorkspace.subscription?.planId ?? "free",
        status: r.referredWorkspace.subscription?.status ?? "active",
        earnedInr: sum("accrued", r.id) + sum("paid", r.id)
      })),
      payouts
    };
  }

  // --- platform owner ------------------------------------------------------

  // Who is owed what. Only accrued (unpaid) commissions count.
  async owed() {
    const rows = await this.prisma.client.commissionEntry.findMany({
      where: { status: "accrued" },
      select: { amountInr: true, referral: { select: { referrerUserId: true } } }
    });
    const byReferrer = new Map<string, { amountInr: number; entries: number }>();
    for (const r of rows) {
      const cur = byReferrer.get(r.referral.referrerUserId) ?? { amountInr: 0, entries: 0 };
      byReferrer.set(r.referral.referrerUserId, { amountInr: cur.amountInr + r.amountInr, entries: cur.entries + 1 });
    }
    const users = await this.prisma.client.user.findMany({ where: { id: { in: [...byReferrer.keys()] } }, select: { id: true, email: true, name: true } });
    const recent = await this.prisma.client.payout.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    return {
      terms: { pct: REFERRAL_COMMISSION_PCT, months: REFERRAL_COMMISSION_MONTHS },
      owed: users.map((u) => ({ userId: u.id, email: u.email, name: u.name, ...byReferrer.get(u.id)! })).sort((a, b) => b.amountInr - a.amountInr),
      recentPayouts: recent
    };
  }

  // Records a payment already made to a referrer (outside Zenora) and settles
  // exactly the commissions that were owed at that moment. Nothing is paid
  // from here.
  async recordPayout(adminUserId: string, referrerUserId: string, reference: string, partnerInvoiceRef?: string) {
    const entries = await this.prisma.client.commissionEntry.findMany({
      where: { status: "accrued", referral: { referrerUserId } },
      select: { id: true, amountInr: true }
    });
    if (entries.length === 0) throw new NotFoundException("Nothing is owed to this person");
    const amountInr = entries.reduce((n, e) => n + e.amountInr, 0);
    const ids = entries.map((e) => e.id);

    return this.prisma.client.$transaction(async (tx) => {
      const payout = await tx.payout.create({ data: { referrerUserId, amountInr, reference, partnerInvoiceRef, paidById: adminUserId } });
      // Only still-accrued rows: if another admin settled some in the meantime
      // the counts differ and the whole thing is rolled back.
      const settled = await tx.commissionEntry.updateMany({ where: { id: { in: ids }, status: "accrued" }, data: { status: "paid", payoutId: payout.id } });
      if (settled.count !== ids.length) throw new BadRequestException("Commissions changed while recording this payout. Please refresh and try again.");
      await tx.platformAuditLog.create({ data: { userId: adminUserId, action: "payout.recorded", detail: `₹${amountInr} to ${referrerUserId} (${reference})` } });
      return payout;
    });
  }

  private async isMember(userId: string, workspaceId: string) {
    return !!(await this.prisma.client.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } }));
  }
}
