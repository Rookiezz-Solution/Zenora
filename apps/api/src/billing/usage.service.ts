import { Injectable } from "@nestjs/common";
import { Prisma } from "@zenora/db";
import { CREDIT_WEIGHTS, PLAN_LIMITS, USAGE_ALERT_THRESHOLDS, type PlanId } from "@zenora/shared";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

// docs/PLANS_AND_LIMITS.md enforcement rules.
const CONTACT_GRACE_RATIO = 1.1; // 10% grace before imports/broadcasts are blocked

export interface LimitCheck {
  allowed: boolean;
  limit: number | null;
  current: number;
}

export interface AiCreditCheck {
  allowed: boolean;
  remaining: number;
  limit: number;
}

@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {}

  private async currentPlanId(workspaceId: string): Promise<PlanId> {
    const sub = await this.prisma.client.subscription.findUnique({ where: { workspaceId } });
    return (sub?.planId as PlanId) ?? "free";
  }

  private async addonQuantity(workspaceId: string, addonKey: string): Promise<number> {
    const rows = await this.prisma.client.workspaceAddon.findMany({ where: { workspaceId, addonKey } });
    return rows.reduce((sum, r) => sum + r.quantity, 0);
  }

  private addToLimit(base: number | null, extra: number): number | null {
    return base === null ? null : base + extra;
  }

  // Running-balance read, no lazy-grant persisted — see debitAiCredits for
  // why the grant only gets written on first actual spend.
  private async aiCreditBalance(workspaceId: string, planId: PlanId): Promise<number> {
    const last = await this.prisma.client.creditLedger.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
    return last?.balanceAfter ?? PLAN_LIMITS[planId].aiCreditsPerMonth;
  }

  async getUsage(workspaceId: string) {
    const planId = await this.currentPlanId(workspaceId);
    const limits = PLAN_LIMITS[planId];

    const [contacts, users, instagramAccounts, extraUsers, extraInstagram, extraContacts, aiCreditsRemaining] = await Promise.all([
      this.prisma.client.lead.count({ where: { workspaceId, mergedIntoId: null } }),
      this.prisma.client.membership.count({ where: { workspaceId } }),
      this.prisma.client.instagramAccount.count({ where: { workspaceId, status: "active" } }),
      this.addonQuantity(workspaceId, "extraUser"),
      this.addonQuantity(workspaceId, "extraInstagramAccount"),
      this.addonQuantity(workspaceId, "extra25kContacts"),
      this.aiCreditBalance(workspaceId, planId)
    ]);

    const effectiveLimits = {
      contacts: this.addToLimit(limits.contacts, extraContacts * 25_000),
      users: this.addToLimit(limits.users, extraUsers),
      instagramAccounts: this.addToLimit(limits.instagramAccounts, extraInstagram)
    };

    return {
      planId,
      limits,
      effectiveLimits,
      usage: { contacts, users, instagramAccounts, aiCreditsRemaining }
    };
  }

  async checkAiCredits(workspaceId: string): Promise<AiCreditCheck> {
    const planId = await this.currentPlanId(workspaceId);
    const limit = PLAN_LIMITS[planId].aiCreditsPerMonth;
    const remaining = await this.aiCreditBalance(workspaceId, planId);
    return { allowed: remaining > 0, remaining, limit };
  }

  // Soft stop (docs/PLANS_AND_LIMITS.md): never blocks the caller's other
  // functionality, just returns allowed=false so the caller can hand over
  // without AI instead of spending a credit it doesn't have. Lazily grants
  // the plan's monthly allotment on first-ever spend — there's no recurring
  // monthly-reset job yet (no true recurring-billing engine, same
  // simplification as Phase 1 item 9's add-ons never expiring).
  async debitAiCredits(workspaceId: string, quantity: number, reason: string): Promise<{ remaining: number; allowed: boolean }> {
    const planId = await this.currentPlanId(workspaceId);
    const last = await this.prisma.client.creditLedger.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    let balance = last?.balanceAfter;
    if (balance === undefined) {
      balance = PLAN_LIMITS[planId].aiCreditsPerMonth;
      if (balance > 0) {
        ops.push(this.prisma.client.creditLedger.create({ data: { workspaceId, delta: balance, reason: "monthly_reset", balanceAfter: balance } }));
      }
    }
    if (balance <= 0) {
      if (ops.length) await this.prisma.client.$transaction(ops);
      return { remaining: balance, allowed: false };
    }

    const balanceAfter = balance - quantity;
    const yearMonth = new Date().toISOString().slice(0, 7);
    ops.push(
      this.prisma.client.creditLedger.create({ data: { workspaceId, delta: -quantity, reason, balanceAfter } }),
      this.prisma.client.usageEvent.create({ data: { workspaceId, type: reason, quantity } }),
      this.prisma.client.usageMonthly.upsert({
        where: { workspaceId_yearMonth: { workspaceId, yearMonth } },
        create: { workspaceId, yearMonth, aiCreditsUsed: quantity },
        update: { aiCreditsUsed: { increment: quantity } }
      })
    );
    await this.prisma.client.$transaction(ops);
    await this.alertOnThresholdCrossing(workspaceId, PLAN_LIMITS[planId].aiCreditsPerMonth, balance, balanceAfter);
    return { remaining: balanceAfter, allowed: true };
  }

  // Fires an in-app notification the first time a debit pushes usage past
  // 50/80/100% of the plan's monthly allotment (docs/PLANS_AND_LIMITS.md
  // "Alerts at 50/80/100%"). WhatsApp/email delivery for these alerts isn't
  // built yet — app notifications only (docs/PROGRESS.md simplification).
  // A notification failure never breaks the credit debit that already
  // succeeded.
  private async alertOnThresholdCrossing(workspaceId: string, limit: number, before: number, after: number): Promise<void> {
    if (limit <= 0) return; // partner plan has no monthly allotment to alert on
    const usedBefore = 1 - before / limit;
    const usedAfter = 1 - after / limit;

    for (const threshold of USAGE_ALERT_THRESHOLDS) {
      if (usedBefore < threshold && usedAfter >= threshold) {
        const pct = Math.round(threshold * 100);
        try {
          await this.notifications.create({
            workspaceId,
            type: "ai_credits_low",
            title: pct >= 100 ? "AI credits used up for this month" : `AI credits ${pct}% used`,
            body: pct >= 100 ? "AI answers and scoring will pause until you top up or the next cycle." : `${Math.max(0, after)} credits remaining this month.`
          });
        } catch {
          // Best-effort — the debit itself already succeeded.
        }
      }
    }
  }

  async debitAiReplyCredit(workspaceId: string): Promise<{ remaining: number; allowed: boolean }> {
    return this.debitAiCredits(workspaceId, CREDIT_WEIGHTS.aiReply, "ai_reply");
  }

  async checkContactLimit(workspaceId: string): Promise<LimitCheck> {
    const { effectiveLimits, usage } = await this.getUsage(workspaceId);
    const limit = effectiveLimits.contacts;
    return { allowed: limit === null || usage.contacts <= limit * CONTACT_GRACE_RATIO, limit, current: usage.contacts };
  }

  async checkUserLimit(workspaceId: string): Promise<LimitCheck> {
    const { effectiveLimits, usage } = await this.getUsage(workspaceId);
    const limit = effectiveLimits.users;
    return { allowed: limit === null || usage.users < limit, limit, current: usage.users };
  }

  async checkInstagramLimit(workspaceId: string): Promise<LimitCheck> {
    const { effectiveLimits, usage } = await this.getUsage(workspaceId);
    const limit = effectiveLimits.instagramAccounts;
    return { allowed: limit === null || usage.instagramAccounts < limit, limit, current: usage.instagramAccounts };
  }

  async recordUsageEvent(workspaceId: string, type: string, quantity = 1): Promise<void> {
    await this.prisma.client.usageEvent.create({ data: { workspaceId, type, quantity } });
  }
}
