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
    creditLedger: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    usageEvent: { create: vi.fn() },
    usageMonthly: { upsert: vi.fn() },
    $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    ...overrides
  };
}

function makeNotifications(overrides: Partial<Record<keyof NotificationsService, unknown>> = {}) {
  return { create: vi.fn(), list: vi.fn(), markRead: vi.fn(), ...overrides } as unknown as NotificationsService;
}

function makeService(client: ReturnType<typeof makeClient>, notifications = makeNotifications()) {
  return { service: new UsageService({ client } as unknown as PrismaService, notifications), notifications };
}

describe("UsageService.getUsage", () => {
  it("defaults to the free plan when there's no subscription row", async () => {
    const client = makeClient();
    const { service } = makeService(client);

    const result = await service.getUsage("ws1");

    expect(result.planId).toBe("free");
    expect(result.limits.contacts).toBe(1000);
  });

  it("reads the subscription's plan when one exists", async () => {
    const client = makeClient({ subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "growth" }) } });
    const { service } = makeService(client);

    const result = await service.getUsage("ws1");

    expect(result.planId).toBe("growth");
    expect(result.limits.contacts).toBe(25_000);
  });

  it("extends the base limit by purchased add-on quantity", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter" }) },
      workspaceAddon: {
        findMany: vi.fn().mockResolvedValue([
          { addonKey: "extra25kContacts", quantity: 2 },
          { addonKey: "extraUser", quantity: 1 }
        ])
      }
    });
    const { service } = makeService(client);

    const result = await service.getUsage("ws1");

    expect(result.effectiveLimits.contacts).toBe(5_000 + 2 * 25_000);
    expect(result.effectiveLimits.users).toBe(2 + 1);
  });

  it("keeps an unlimited (null) base limit unlimited regardless of add-ons", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "partner" }) }
    });
    const { service } = makeService(client);

    const result = await service.getUsage("ws1");

    expect(result.effectiveLimits.contacts).toBeNull();
  });
});

describe("UsageService.checkContactLimit", () => {
  it("allows usage within the plan limit", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "free" }) },
      lead: { count: vi.fn().mockResolvedValue(900) }
    });
    const { service } = makeService(client);

    const result = await service.checkContactLimit("ws1");
    expect(result).toEqual({ allowed: true, limit: 1000, current: 900 });
  });

  it("still allows usage within the 10% grace band over the limit", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "free" }) },
      lead: { count: vi.fn().mockResolvedValue(1050) }
    });
    const { service } = makeService(client);

    const result = await service.checkContactLimit("ws1");
    expect(result.allowed).toBe(true);
  });

  it("blocks once usage exceeds the 10% grace band", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "free" }) },
      lead: { count: vi.fn().mockResolvedValue(1101) }
    });
    const { service } = makeService(client);

    const result = await service.checkContactLimit("ws1");
    expect(result.allowed).toBe(false);
  });
});

describe("UsageService.checkUserLimit", () => {
  it("blocks at (not before) the exact seat limit", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "free" }) },
      membership: { count: vi.fn().mockResolvedValue(1) }
    });
    const { service } = makeService(client);

    const result = await service.checkUserLimit("ws1");
    expect(result).toEqual({ allowed: false, limit: 1, current: 1 });
  });

  it("allows one seat below the limit", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter" }) },
      membership: { count: vi.fn().mockResolvedValue(1) }
    });
    const { service } = makeService(client);

    const result = await service.checkUserLimit("ws1");
    expect(result.allowed).toBe(true);
  });
});

describe("UsageService.checkInstagramLimit", () => {
  it("blocks at the exact account limit", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "free" }) },
      instagramAccount: { count: vi.fn().mockResolvedValue(1) }
    });
    const { service } = makeService(client);

    const result = await service.checkInstagramLimit("ws1");
    expect(result.allowed).toBe(false);
  });
});

describe("UsageService.checkAiCredits", () => {
  it("reads the plan's monthly allotment when no ledger rows exist yet", async () => {
    const client = makeClient({ subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter" }) } });
    const { service } = makeService(client);

    const result = await service.checkAiCredits("ws1");
    expect(result).toEqual({ allowed: true, remaining: 1000, limit: 1000 });
  });

  it("reads the running ledger balance when one exists", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter" }) },
      creditLedger: { findFirst: vi.fn().mockResolvedValue({ balanceAfter: 40 }), create: vi.fn() }
    });
    const { service } = makeService(client);

    const result = await service.checkAiCredits("ws1");
    expect(result).toEqual({ allowed: true, remaining: 40, limit: 1000 });
  });

  it("disallows once the balance is exhausted", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "free" }) },
      creditLedger: { findFirst: vi.fn().mockResolvedValue({ balanceAfter: 0 }), create: vi.fn() }
    });
    const { service } = makeService(client);

    const result = await service.checkAiCredits("ws1");
    expect(result.allowed).toBe(false);
  });
});

describe("UsageService.debitAiCredits", () => {
  it("lazily grants the plan's monthly allotment on first-ever spend, then debits", async () => {
    const client = makeClient({ subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "free" }) } });
    const { service } = makeService(client);

    const result = await service.debitAiCredits("ws1", 1, "ai_reply");

    expect(result).toEqual({ remaining: 49, allowed: true });
    expect(client.creditLedger.create).toHaveBeenCalledWith({ data: { workspaceId: "ws1", delta: 50, reason: "monthly_reset", balanceAfter: 50 } });
    expect(client.creditLedger.create).toHaveBeenCalledWith({ data: { workspaceId: "ws1", delta: -1, reason: "ai_reply", balanceAfter: 49 } });
    expect(client.usageEvent.create).toHaveBeenCalledWith({ data: { workspaceId: "ws1", type: "ai_reply", quantity: 1 } });
  });

  it("debits from the existing running balance without re-granting", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter" }) },
      creditLedger: { findFirst: vi.fn().mockResolvedValue({ balanceAfter: 10 }), create: vi.fn() }
    });
    const { service } = makeService(client);

    const result = await service.debitAiCredits("ws1", 3, "ai_reply");

    expect(result).toEqual({ remaining: 7, allowed: true });
    expect(client.creditLedger.create).toHaveBeenCalledTimes(1);
    expect(client.creditLedger.create).toHaveBeenCalledWith({ data: { workspaceId: "ws1", delta: -3, reason: "ai_reply", balanceAfter: 7 } });
  });

  it("returns allowed=false without debiting once the balance is exhausted (soft stop)", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter" }) },
      creditLedger: { findFirst: vi.fn().mockResolvedValue({ balanceAfter: 0 }), create: vi.fn() }
    });
    const { service } = makeService(client);

    const result = await service.debitAiCredits("ws1", 1, "ai_reply");

    expect(result).toEqual({ remaining: 0, allowed: false });
    expect(client.creditLedger.create).not.toHaveBeenCalled();
  });

  it("debitAiReplyCredit debits exactly CREDIT_WEIGHTS.aiReply (1 credit)", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter" }) },
      creditLedger: { findFirst: vi.fn().mockResolvedValue({ balanceAfter: 10 }), create: vi.fn() }
    });
    const { service } = makeService(client);

    const result = await service.debitAiReplyCredit("ws1");
    expect(result).toEqual({ remaining: 9, allowed: true });
  });
});

describe("UsageService.debitAiCredits alert thresholds", () => {
  it("fires an 80%-used notification the first time a debit crosses it", async () => {
    // starter plan: 1000/mo — balance 210 (79% used) minus 20 crosses 80%
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter" }) },
      creditLedger: { findFirst: vi.fn().mockResolvedValue({ balanceAfter: 210 }), create: vi.fn() }
    });
    const { service, notifications } = makeService(client);

    await service.debitAiCredits("ws1", 20, "ai_reply");

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws1", type: "ai_credits_low", title: "AI credits 80% used" })
    );
  });

  it("fires a used-up notification when a debit exhausts the balance", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter" }) },
      creditLedger: { findFirst: vi.fn().mockResolvedValue({ balanceAfter: 1 }), create: vi.fn() }
    });
    const { service, notifications } = makeService(client);

    await service.debitAiCredits("ws1", 1, "ai_reply");

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ai_credits_low", title: "AI credits used up for this month" })
    );
  });

  it("does not re-fire a threshold already crossed by an earlier debit", async () => {
    // already at 85% used (150 remaining of 1000) before this debit — 80%
    // threshold was crossed earlier, only 50%/80% below current usage
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter" }) },
      creditLedger: { findFirst: vi.fn().mockResolvedValue({ balanceAfter: 150 }), create: vi.fn() }
    });
    const { service, notifications } = makeService(client);

    await service.debitAiCredits("ws1", 10, "ai_reply");

    expect(notifications.create).not.toHaveBeenCalled();
  });

  it("skips alerting entirely for a plan with no monthly allotment (partner)", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "partner" }) },
      creditLedger: { findFirst: vi.fn().mockResolvedValue(null) }
    });
    const { service, notifications } = makeService(client);

    await service.debitAiCredits("ws1", 1, "ai_reply");

    expect(notifications.create).not.toHaveBeenCalled();
  });

  it("a notification failure never breaks the credit debit itself", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter" }) },
      creditLedger: { findFirst: vi.fn().mockResolvedValue({ balanceAfter: 1 }), create: vi.fn() }
    });
    const notifications = makeNotifications({ create: vi.fn().mockRejectedValue(new Error("db down")) });
    const { service } = makeService(client, notifications);

    const result = await service.debitAiCredits("ws1", 1, "ai_reply");

    expect(result).toEqual({ remaining: 0, allowed: true });
  });
});

describe("UsageService.getUsage cost", () => {
  it("reads everything in one parallel batch: a single add-on query, each table once", async () => {
    const client = makeClient();
    const { service } = makeService(client);
    await service.getUsage("ws1");

    expect(client.workspaceAddon.findMany).toHaveBeenCalledTimes(1);
    expect(client.subscription.findUnique).toHaveBeenCalledTimes(1);
    expect(client.workspaceLimitOverride.findUnique).toHaveBeenCalledTimes(1);
    expect(client.creditLedger.findFirst).toHaveBeenCalledTimes(1);
    expect(client.lead.count).toHaveBeenCalledTimes(1);
  });
});

describe("UsageService owner-console overrides and grants", () => {
  it("lets a super-admin override replace the plan-plus-add-ons figure, per limit", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter" }) },
      workspaceLimitOverride: { findUnique: vi.fn().mockResolvedValue({ contacts: 12_000, users: null, instagramAccounts: 0 }) }
    });
    const { service } = makeService(client);

    const result = await service.getUsage("ws1");

    expect(result.effectiveLimits).toEqual({ contacts: 12_000, users: 2, instagramAccounts: 0 });
    expect(result.limits.contacts).toBe(5_000); // the plan itself is untouched
  });

  it("enforces an overridden limit in the same checks as any other", async () => {
    const client = makeClient({
      lead: { count: vi.fn().mockResolvedValue(1500) },
      workspaceLimitOverride: { findUnique: vi.fn().mockResolvedValue({ contacts: 2000, users: null, instagramAccounts: null }) }
    });
    const { service } = makeService(client);
    expect((await service.checkContactLimit("ws1")).allowed).toBe(true); // free plan would say no (1000)
  });

  it("grants credits on top of the running balance", async () => {
    const create = vi.fn();
    const client = makeClient({ creditLedger: { findFirst: vi.fn().mockResolvedValue({ balanceAfter: 40 }), create } });
    const { service } = makeService(client);

    await expect(service.grantCredits("ws1", 500, "admin_grant")).resolves.toEqual({ balance: 540 });
    expect(create).toHaveBeenCalledWith({ data: { workspaceId: "ws1", delta: 500, reason: "admin_grant", balanceAfter: 540 } });
  });

  it("writes the plan's first allotment before the grant when the workspace never spent", async () => {
    const create = vi.fn();
    const client = makeClient({ creditLedger: { findFirst: vi.fn().mockResolvedValue(null), create } });
    const { service } = makeService(client);

    await expect(service.grantCredits("ws1", 100, "admin_grant")).resolves.toEqual({ balance: 150 }); // free plan: 50 + 100
    expect(create.mock.calls.map((c) => c[0].data.reason)).toEqual(["monthly_reset", "admin_grant"]);
  });
});
