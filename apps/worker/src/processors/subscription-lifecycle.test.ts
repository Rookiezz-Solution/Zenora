import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  planConfigOverride: { findUnique: vi.fn() },
  subscription: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  workspace: { update: vi.fn() },
  notification: { findFirst: vi.fn(), create: vi.fn() },
  creditLedger: { findFirst: vi.fn(), aggregate: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn()
}));
vi.mock("@zenora/db", () => ({ prisma: prismaMock, Prisma: { sql: (s: TemplateStringsArray) => s.join("?") } }));

import { processSubscriptionLifecycle } from "./subscription-lifecycle";

const now = new Date("2026-10-10T00:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.planConfigOverride.findUnique.mockResolvedValue(null);
  prismaMock.subscription.findMany.mockResolvedValue([]);
  prismaMock.subscription.findUnique.mockResolvedValue(null);
  prismaMock.notification.findFirst.mockResolvedValue(null);
  prismaMock.creditLedger.findFirst.mockResolvedValue({ balanceAfter: 2000 });
  prismaMock.creditLedger.aggregate.mockResolvedValue({ _sum: { delta: null } });
  prismaMock.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
  prismaMock.$queryRaw.mockResolvedValue([]);
});

describe("processSubscriptionLifecycle", () => {
  it("ends a trial: free plan on both rows, credits cut to the free allotment, and tells the customer", async () => {
    prismaMock.subscription.findMany.mockResolvedValue([{ workspaceId: "ws1", planId: "growth", status: "trialing", trialEndsAt: days(-1), currentPeriodEnd: null }]);
    const r = await processSubscriptionLifecycle(now);
    expect(r.trialsEnded).toBe(1);
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({ where: { workspaceId: "ws1" }, data: { planId: "free", status: "active", currentPeriodEnd: null } });
    expect(prismaMock.workspace.update).toHaveBeenCalledWith({ where: { id: "ws1" }, data: { planId: "free" } });
    expect(prismaMock.creditLedger.create).toHaveBeenCalledWith({ data: { workspaceId: "ws1", delta: -1950, reason: "trial_ended", balanceAfter: 50 } });
    expect(prismaMock.notification.create.mock.calls[0]![0].data).toMatchObject({ workspaceId: "ws1", type: "trial_ended", channel: "app" });
  });

  it("keeps credits bought during the trial", async () => {
    prismaMock.subscription.findMany.mockResolvedValue([{ workspaceId: "ws1", planId: "growth", status: "trialing", trialEndsAt: days(-1), currentPeriodEnd: null }]);
    prismaMock.creditLedger.aggregate.mockResolvedValue({ _sum: { delta: 1000 } });
    await processSubscriptionLifecycle(now);
    expect(prismaMock.creditLedger.create.mock.calls[0]![0].data.balanceAfter).toBe(1050);
  });

  it("reminds once before the period ends, not again within 4 days", async () => {
    prismaMock.subscription.findMany.mockResolvedValue([{ workspaceId: "ws1", planId: "starter", status: "active", currentPeriodEnd: days(2) }]);
    expect((await processSubscriptionLifecycle(now)).reminded).toBe(1);
    prismaMock.notification.findFirst.mockResolvedValue({ id: "n1" });
    prismaMock.notification.create.mockClear();
    expect((await processSubscriptionLifecycle(now)).reminded).toBe(0);
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it("marks past due at the end of the period, and drops to free after the grace", async () => {
    prismaMock.subscription.findMany.mockResolvedValue([
      { workspaceId: "ws1", planId: "starter", status: "active", currentPeriodEnd: days(-1) },
      { workspaceId: "ws2", planId: "pro", status: "past_due", currentPeriodEnd: days(-6) }
    ]);
    const r = await processSubscriptionLifecycle(now);
    expect(r).toMatchObject({ pastDue: 1, lapsed: 1 });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({ where: { workspaceId: "ws1" }, data: { status: "past_due" } });
    expect(prismaMock.workspace.update).toHaveBeenCalledWith({ where: { id: "ws2" }, data: { planId: "free" } });
  });

  it("one workspace failing does not stop the others", async () => {
    prismaMock.subscription.findMany.mockResolvedValue([
      { workspaceId: "bad", planId: "starter", status: "past_due", currentPeriodEnd: days(-6) },
      { workspaceId: "ok", planId: "starter", status: "past_due", currentPeriodEnd: days(-6) }
    ]);
    prismaMock.$transaction.mockRejectedValueOnce(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await processSubscriptionLifecycle(now)).lapsed).toBe(1);
    spy.mockRestore();
  });

  it("resets each workspace's monthly credits to its plan's allotment", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ workspaceId: "ws1" }]).mockResolvedValue([]);
    prismaMock.subscription.findUnique.mockResolvedValue({ planId: "starter", status: "active", currentPeriodEnd: days(10) });
    prismaMock.creditLedger.findFirst.mockResolvedValue({ balanceAfter: 140 });
    const r = await processSubscriptionLifecycle(now);
    expect(r.creditsReset).toBe(1);
    expect(prismaMock.creditLedger.create).toHaveBeenCalledWith({ data: { workspaceId: "ws1", delta: 860, reason: "monthly_reset", balanceAfter: 1000 } });
  });

  it("does not pick a workspace that keeps failing up forever", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ workspaceId: "ws1" }]);
    prismaMock.subscription.findUnique.mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await processSubscriptionLifecycle(now)).creditsReset).toBe(0);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2); // the second page returns only the already-tried workspace, so it stops
    spy.mockRestore();
  });
});
