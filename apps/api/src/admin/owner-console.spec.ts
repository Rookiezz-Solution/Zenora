import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { UsageService } from "../billing/usage.service";
import type { PrismaService } from "../prisma/prisma.service";
import { OwnerConsoleService } from "./owner-console.service";

function make(client: Record<string, unknown> = {}, usage: Record<string, unknown> = {}) {
  const full = {
    workspace: { findUnique: vi.fn().mockResolvedValue({ id: "ws1" }), count: vi.fn().mockResolvedValue(3), findMany: vi.fn().mockResolvedValue([]) },
    user: { count: vi.fn().mockResolvedValue(5) },
    subscription: { findMany: vi.fn().mockResolvedValue([]) },
    invoice: { aggregate: vi.fn().mockResolvedValue({ _sum: { amountInr: 0 } }), groupBy: vi.fn().mockResolvedValue([]) },
    creditLedger: { aggregate: vi.fn().mockResolvedValue({ _sum: { delta: 0 } }), groupBy: vi.fn().mockResolvedValue([]) },
    lead: { groupBy: vi.fn().mockResolvedValue([]) },
    workspaceLimitOverride: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn(), deleteMany: vi.fn() },
    platformAuditLog: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
    usageEvent: { groupBy: vi.fn().mockResolvedValue([]) },
    membership: { findMany: vi.fn().mockResolvedValue([]) },
    ...client
  };
  const usageSvc = {
    getUsage: vi.fn().mockResolvedValue({ effectiveLimits: { contacts: 1000, users: 1, instagramAccounts: 1 }, usage: { contacts: 0, users: 1, instagramAccounts: 0, aiCreditsRemaining: 50 } }),
    grantCredits: vi.fn().mockResolvedValue({ balance: 550 }),
    ...usage
  };
  return { service: new OwnerConsoleService({ client: full } as unknown as PrismaService, usageSvc as unknown as UsageService), client: full, usage: usageSvc };
}

describe("OwnerConsoleService.summary", () => {
  it("counts plans, MRR (active paid only), and the 30-day margin", async () => {
    const { service } = make({
      workspace: { count: vi.fn().mockResolvedValue(4) },
      subscription: {
        findMany: vi.fn().mockResolvedValue([
          { planId: "growth", billingCycle: "monthly", status: "active" },
          { planId: "starter", billingCycle: "monthly", status: "active" },
          { planId: "pro", billingCycle: "monthly", status: "trialing" }
        ])
      },
      invoice: { aggregate: vi.fn().mockResolvedValue({ _sum: { amountInr: 5498 } }) },
      creditLedger: { aggregate: vi.fn().mockResolvedValue({ _sum: { delta: -400 } }) }
    });

    const s = await service.summary();

    expect(s.mrrInr).toBe(3999 + 1499);
    expect(s.byPlan).toEqual({ growth: 1, starter: 1, pro: 1, free: 1 }); // the 4th workspace has no subscription row
    expect(s).toMatchObject({ revenueInr: 5498, costInr: 100, marginInr: 5398 });
  });
});

describe("OwnerConsoleService.listWorkspaces", () => {
  it("joins plan, usage and economics per workspace without a query per row", async () => {
    const { service, client } = make({
      workspace: {
        findMany: vi.fn().mockResolvedValue([
          { id: "a", name: "Asha Clinic", createdAt: new Date(), subscription: { planId: "starter", status: "active", billingCycle: "monthly" }, limitOverride: { id: "o" }, _count: { memberships: 2 } },
          { id: "b", name: "Bare", createdAt: new Date(), subscription: null, limitOverride: null, _count: { memberships: 1 } }
        ])
      },
      lead: { groupBy: vi.fn().mockResolvedValue([{ workspaceId: "a", _count: { _all: 120 } }]) },
      invoice: { groupBy: vi.fn().mockResolvedValue([{ workspaceId: "a", _sum: { amountInr: 1499 } }]) },
      creditLedger: { groupBy: vi.fn().mockResolvedValue([{ workspaceId: "a", _sum: { delta: -40 } }]) }
    });

    const rows = await service.listWorkspaces("clinic");

    expect(rows[0]).toMatchObject({ id: "a", planId: "starter", members: 2, contacts: 120, hasOverride: true, creditsUsed: 40, revenueInr: 1499, costInr: 10, marginInr: 1489 });
    expect(rows[1]).toMatchObject({ id: "b", planId: "free", status: "active", contacts: 0, hasOverride: false, revenueInr: 0, marginPct: null });
    expect((client.workspace.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where).toEqual({ name: { contains: "clinic", mode: "insensitive" } });
    expect(client.lead.groupBy).toHaveBeenCalledTimes(1);
  });
});

describe("OwnerConsoleService.setLimits", () => {
  it("stores overrides, keeps the others, and writes an audit entry naming what changed", async () => {
    const { service, client } = make({ workspaceLimitOverride: { findUnique: vi.fn().mockResolvedValue({ contacts: null, users: 3, instagramAccounts: null, note: "old" }), upsert: vi.fn(), deleteMany: vi.fn() } });
    await service.setLimits("admin1", "ws1", { contacts: 8000, note: "Pilot customer" });

    const call = (client.workspaceLimitOverride.upsert as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.update).toMatchObject({ contacts: 8000, users: 3, instagramAccounts: null, note: "Pilot customer", updatedById: "admin1" });
    expect((client.platformAuditLog.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data).toMatchObject({
      userId: "admin1",
      action: "limits.set",
      workspaceId: "ws1",
      detail: "contacts: plan default → 8000 (Pilot customer)"
    });
  });

  it("removes the row when every override is cleared", async () => {
    const { service, client } = make({ workspaceLimitOverride: { findUnique: vi.fn().mockResolvedValue({ contacts: 8000, users: null, instagramAccounts: null, note: null }), upsert: vi.fn(), deleteMany: vi.fn() } });
    await service.setLimits("admin1", "ws1", { contacts: null });

    expect(client.workspaceLimitOverride.deleteMany).toHaveBeenCalledWith({ where: { workspaceId: "ws1" } });
    expect(client.workspaceLimitOverride.upsert).not.toHaveBeenCalled();
  });

  it("404s for an unknown workspace without writing anything", async () => {
    const { service, client } = make({ workspace: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(service.setLimits("admin1", "nope", { users: 5 })).rejects.toThrow(NotFoundException);
    expect(client.platformAuditLog.create).not.toHaveBeenCalled();
  });
});

describe("OwnerConsoleService.grantCredits", () => {
  it("grants through the usage ledger and audits the amount and reason", async () => {
    const { service, client, usage } = make();
    await expect(service.grantCredits("admin1", "ws1", 500, "Goodwill after outage")).resolves.toEqual({ balance: 550 });

    expect(usage.grantCredits).toHaveBeenCalledWith("ws1", 500, "admin_grant");
    expect((client.platformAuditLog.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data).toMatchObject({
      action: "credits.granted",
      workspaceId: "ws1",
      detail: "+500 credits (Goodwill after outage); balance now 550"
    });
  });

  it("404s for an unknown workspace", async () => {
    const { service, usage } = make({ workspace: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(service.grantCredits("admin1", "nope", 5, "test")).rejects.toThrow(NotFoundException);
    expect(usage.grantCredits).not.toHaveBeenCalled();
  });
});
