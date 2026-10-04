import { describe, expect, it, vi } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { UsageService } from "./usage.service";

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    subscription: { findUnique: vi.fn().mockResolvedValue(null) },
    lead: { count: vi.fn().mockResolvedValue(0) },
    membership: { count: vi.fn().mockResolvedValue(1) },
    instagramAccount: { count: vi.fn().mockResolvedValue(0) },
    workspaceAddon: { findMany: vi.fn().mockResolvedValue([]) },
    workspaceLimitOverride: { findUnique: vi.fn().mockResolvedValue(null) },
    creditLedger: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(), aggregate: vi.fn() },
    ...overrides
  };
}

const service = (client: ReturnType<typeof makeClient>) => new UsageService({ client } as unknown as PrismaService, { create: vi.fn() } as unknown as NotificationsService);
const day = 86_400_000;

describe("UsageService effective plan and credit reset", () => {
  it("limits a cancelled subscription to the free plan straight away", async () => {
    const client = makeClient({ subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "pro", status: "canceled", currentPeriodEnd: new Date(Date.now() + 20 * day) }) } });
    expect((await service(client).getUsage("ws1")).planId).toBe("free");
  });

  it("gives the trial plan's limits during the trial and the free plan's after it", async () => {
    const during = makeClient({ subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "growth", status: "trialing", trialEndsAt: new Date(Date.now() + 3 * day) }) } });
    const after = makeClient({ subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "growth", status: "trialing", trialEndsAt: new Date(Date.now() - day) }) } });
    expect((await service(during).getUsage("ws1")).planId).toBe("growth");
    expect((await service(after).getUsage("ws1")).planId).toBe("free");
  });

  it("reports the plan, trial end and balance for the dashboard", async () => {
    const trialEndsAt = new Date(Date.now() + 3 * day);
    const client = makeClient({ subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "growth", status: "trialing", trialEndsAt, currentPeriodEnd: null }) } });
    expect(await service(client).aiCreditsSummary("ws1")).toMatchObject({ monthly: 3000, remaining: 3000, plan: { id: "growth", status: "trialing", trialEndsAt } });
  });

  it("on a plan change, takes the balance to the new allotment plus bought credits still unspent", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter", status: "active", currentPeriodEnd: new Date(Date.now() + 30 * day) }) },
      creditLedger: { findFirst: vi.fn().mockResolvedValue({ balanceAfter: 20 }), create: vi.fn(), aggregate: vi.fn().mockResolvedValue({ _sum: { delta: 1000 } }) }
    });
    await service(client).resetCreditsToPlan("ws1");
    // allotment 1000 + min(20 left, 1000 bought) = 1020
    expect(client.creditLedger.create).toHaveBeenCalledWith({ data: { workspaceId: "ws1", delta: 1000, reason: "plan_change", balanceAfter: 1020 } });
  });

  it("does nothing on a plan change for a workspace that has never used AI", async () => {
    const client = makeClient();
    await service(client).resetCreditsToPlan("ws1");
    expect(client.creditLedger.create).not.toHaveBeenCalled();
  });
});
