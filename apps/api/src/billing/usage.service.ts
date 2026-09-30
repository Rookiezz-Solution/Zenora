import { Injectable } from "@nestjs/common";
import { PLAN_LIMITS, type PlanId } from "@zenora/shared";
import { PrismaService } from "../prisma/prisma.service";

// docs/PLANS_AND_LIMITS.md enforcement rules — everything except AI credits,
// which stays unmetered until Phase 2 actually has an AI feature to meter
// (see docs/ROADMAP.md item 9's scope note).
const CONTACT_GRACE_RATIO = 1.1; // 10% grace before imports/broadcasts are blocked

export interface LimitCheck {
  allowed: boolean;
  limit: number | null;
  current: number;
}

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

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

  async getUsage(workspaceId: string) {
    const planId = await this.currentPlanId(workspaceId);
    const limits = PLAN_LIMITS[planId];

    const [contacts, users, instagramAccounts, extraUsers, extraInstagram, extraContacts] = await Promise.all([
      this.prisma.client.lead.count({ where: { workspaceId, mergedIntoId: null } }),
      this.prisma.client.membership.count({ where: { workspaceId } }),
      this.prisma.client.instagramAccount.count({ where: { workspaceId, status: "active" } }),
      this.addonQuantity(workspaceId, "extraUser"),
      this.addonQuantity(workspaceId, "extraInstagramAccount"),
      this.addonQuantity(workspaceId, "extra25kContacts")
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
      usage: { contacts, users, instagramAccounts }
    };
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
