import { Injectable, NotFoundException } from "@nestjs/common";
import { OVERRIDABLE_LIMITS, PLAN_LIMITS, describeLimitChange, estimateEconomics, monthlyRecurringRevenueInr, type LimitOverrides, type PlanId } from "@zenora/shared";
import { UsageService } from "../billing/usage.service";
import { PrismaService } from "../prisma/prisma.service";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;
const LIST_LIMIT = 100;

const sinceWindow = () => new Date(Date.now() - WINDOW_DAYS * DAY_MS);

export interface SetLimitsInput extends Partial<LimitOverrides> {
  note?: string | null;
}

// Platform-owner view of every workspace: who they are, what they use, what
// they bring in and what the AI costs. Read-mostly — the only writes are the
// two audited support actions (limit override, credit grant).
@Injectable()
export class OwnerConsoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService
  ) {}

  async summary() {
    const since = sinceWindow();
    const [workspaces, users, subs, invoices, spent] = await Promise.all([
      this.prisma.client.workspace.count(),
      this.prisma.client.user.count(),
      this.prisma.client.subscription.findMany({ select: { planId: true, billingCycle: true, status: true } }),
      this.prisma.client.invoice.aggregate({ where: { status: "paid", issuedAt: { gte: since } }, _sum: { amountInr: true } }),
      this.prisma.client.creditLedger.aggregate({ where: { delta: { lt: 0 }, createdAt: { gte: since } }, _sum: { delta: true } })
    ]);

    const byPlan: Record<string, number> = {};
    let mrrInr = 0;
    for (const s of subs) {
      byPlan[s.planId] = (byPlan[s.planId] ?? 0) + 1;
      mrrInr += monthlyRecurringRevenueInr(s.planId as PlanId, s.billingCycle, s.status);
    }
    // Workspaces with no subscription row are on the free plan.
    byPlan.free = (byPlan.free ?? 0) + Math.max(0, workspaces - subs.length);

    return {
      workspaces,
      users,
      byPlan,
      mrrInr,
      windowDays: WINDOW_DAYS,
      ...estimateEconomics({ paidInvoicesInr: invoices._sum.amountInr ?? 0, creditsUsed: Math.abs(spent._sum.delta ?? 0) })
    };
  }

  async listWorkspaces(search?: string) {
    const since = sinceWindow();
    const workspaces = await this.prisma.client.workspace.findMany({
      where: search ? { name: { contains: search, mode: "insensitive" } } : undefined,
      select: {
        id: true,
        name: true,
        createdAt: true,
        subscription: { select: { planId: true, status: true, billingCycle: true } },
        limitOverride: { select: { id: true } },
        _count: { select: { memberships: true } }
      },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT
    });
    const ids = workspaces.map((w) => w.id);

    const [contacts, invoices, spent] = await Promise.all([
      this.prisma.client.lead.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: ids }, mergedIntoId: null }, _count: { _all: true } }),
      this.prisma.client.invoice.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: ids }, status: "paid", issuedAt: { gte: since } }, _sum: { amountInr: true } }),
      this.prisma.client.creditLedger.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: ids }, delta: { lt: 0 }, createdAt: { gte: since } }, _sum: { delta: true } })
    ]);
    const contactsBy = new Map(contacts.map((r) => [r.workspaceId, r._count._all]));
    const invoicesBy = new Map(invoices.map((r) => [r.workspaceId, r._sum.amountInr ?? 0]));
    const spentBy = new Map(spent.map((r) => [r.workspaceId, Math.abs(r._sum.delta ?? 0)]));

    return workspaces.map((w) => {
      const planId = (w.subscription?.planId ?? "free") as PlanId;
      return {
        id: w.id,
        name: w.name,
        createdAt: w.createdAt,
        planId,
        status: w.subscription?.status ?? "active",
        members: w._count.memberships,
        contacts: contactsBy.get(w.id) ?? 0,
        hasOverride: !!w.limitOverride,
        creditsUsed: spentBy.get(w.id) ?? 0,
        ...estimateEconomics({ paidInvoicesInr: invoicesBy.get(w.id) ?? 0, creditsUsed: spentBy.get(w.id) ?? 0 })
      };
    });
  }

  async getWorkspace(workspaceId: string) {
    const workspace = await this.prisma.client.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, createdAt: true, timezone: true, subscription: { select: { planId: true, status: true, billingCycle: true, currentPeriodEnd: true } } }
    });
    if (!workspace) throw new NotFoundException("Workspace not found");

    const since = sinceWindow();
    const [usage, override, byType, owners, audit, invoices, spent] = await Promise.all([
      this.usage.getUsage(workspaceId),
      this.prisma.client.workspaceLimitOverride.findUnique({ where: { workspaceId } }),
      this.prisma.client.usageEvent.groupBy({ by: ["type"], where: { workspaceId, createdAt: { gte: since } }, _sum: { quantity: true } }),
      this.prisma.client.membership.findMany({ where: { workspaceId, role: "owner" }, select: { user: { select: { email: true, name: true } } } }),
      this.prisma.client.platformAuditLog.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 20 }),
      this.prisma.client.invoice.aggregate({ where: { workspaceId, status: "paid", issuedAt: { gte: since } }, _sum: { amountInr: true } }),
      this.prisma.client.creditLedger.aggregate({ where: { workspaceId, delta: { lt: 0 }, createdAt: { gte: since } }, _sum: { delta: true } })
    ]);

    const planId = (workspace.subscription?.planId ?? "free") as PlanId;
    return {
      ...workspace,
      planId,
      owners: owners.map((o) => o.user),
      plan: PLAN_LIMITS[planId],
      effectiveLimits: usage.effectiveLimits,
      current: usage.usage,
      override: override ? { contacts: override.contacts, users: override.users, instagramAccounts: override.instagramAccounts, note: override.note, updatedAt: override.updatedAt } : null,
      usageByType: byType.map((r) => ({ type: r.type, quantity: r._sum.quantity ?? 0 })),
      windowDays: WINDOW_DAYS,
      ...estimateEconomics({ paidInvoicesInr: invoices._sum.amountInr ?? 0, creditsUsed: Math.abs(spent._sum.delta ?? 0) }),
      audit: audit.map((a) => ({ id: a.id, action: a.action, detail: a.detail, createdAt: a.createdAt }))
    };
  }

  // Passing a limit as null clears that override. When every limit is null the
  // row is removed, so "no overrides" is simply the absence of a row.
  async setLimits(adminUserId: string, workspaceId: string, input: SetLimitsInput) {
    await this.ensureWorkspace(workspaceId);
    const existing = await this.prisma.client.workspaceLimitOverride.findUnique({ where: { workspaceId } });
    const before = this.toOverrides(existing);
    const after = { ...before };
    for (const key of OVERRIDABLE_LIMITS) if (input[key] !== undefined) after[key] = input[key] ?? null;

    if (OVERRIDABLE_LIMITS.every((k) => after[k] === null)) {
      await this.prisma.client.workspaceLimitOverride.deleteMany({ where: { workspaceId } });
    } else {
      const data = { ...after, note: input.note !== undefined ? input.note : (existing?.note ?? null), updatedById: adminUserId };
      await this.prisma.client.workspaceLimitOverride.upsert({ where: { workspaceId }, create: { workspaceId, ...data }, update: data });
    }
    const detail = describeLimitChange(before, after);
    await this.audit(adminUserId, "limits.set", workspaceId, input.note ? `${detail} (${input.note})` : detail);
    return this.getWorkspace(workspaceId);
  }

  async grantCredits(adminUserId: string, workspaceId: string, amount: number, reason: string) {
    await this.ensureWorkspace(workspaceId);
    const { balance } = await this.usage.grantCredits(workspaceId, amount, "admin_grant");
    await this.audit(adminUserId, "credits.granted", workspaceId, `+${amount} credits (${reason}); balance now ${balance}`);
    return { balance };
  }

  private toOverrides(row: { contacts: number | null; users: number | null; instagramAccounts: number | null } | null): LimitOverrides {
    return { contacts: row?.contacts ?? null, users: row?.users ?? null, instagramAccounts: row?.instagramAccounts ?? null };
  }

  private async ensureWorkspace(workspaceId: string) {
    const exists = await this.prisma.client.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
    if (!exists) throw new NotFoundException("Workspace not found");
  }

  private audit(userId: string, action: string, workspaceId: string, detail: string) {
    return this.prisma.client.platformAuditLog.create({ data: { userId, action, workspaceId, detail } });
  }
}
