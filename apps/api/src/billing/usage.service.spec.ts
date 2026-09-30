import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { UsageService } from "./usage.service";

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    subscription: { findUnique: vi.fn().mockResolvedValue(null) },
    lead: { count: vi.fn().mockResolvedValue(0) },
    membership: { count: vi.fn().mockResolvedValue(1) },
    instagramAccount: { count: vi.fn().mockResolvedValue(0) },
    workspaceAddon: { findMany: vi.fn().mockResolvedValue([]) },
    creditLedger: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    usageEvent: { create: vi.fn() },
    usageMonthly: { upsert: vi.fn() },
    $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    ...overrides
  };
}

function makeService(client: ReturnType<typeof makeClient>) {
  return new UsageService({ client } as unknown as PrismaService);
}

describe("UsageService.getUsage", () => {
  it("defaults to the free plan when there's no subscription row", async () => {
    const client = makeClient();
    const service = makeService(client);

    const result = await service.getUsage("ws1");

    expect(result.planId).toBe("free");
    expect(result.limits.contacts).toBe(1000);
  });

  it("reads the subscription's plan when one exists", async () => {
    const client = makeClient({ subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "growth" }) } });
    const service = makeService(client);

    const result = await service.getUsage("ws1");

    expect(result.planId).toBe("growth");
    expect(result.limits.contacts).toBe(25_000);
  });

  it("extends the base limit by purchased add-on quantity", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter" }) },
      workspaceAddon: {
        findMany: vi.fn().mockImplementation(({ where }: { where: { addonKey: string } }) =>
          Promise.resolve(where.addonKey === "extra25kContacts" ? [{ quantity: 2 }] : where.addonKey === "extraUser" ? [{ quantity: 1 }] : [])
        )
      }
    });
    const service = makeService(client);

    const result = await service.getUsage("ws1");

    expect(result.effectiveLimits.contacts).toBe(5_000 + 2 * 25_000);
    expect(result.effectiveLimits.users).toBe(2 + 1);
  });

  it("keeps an unlimited (null) base limit unlimited regardless of add-ons", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "partner" }) }
    });
    const service = makeService(client);

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
    const service = makeService(client);

    const result = await service.checkContactLimit("ws1");
    expect(result).toEqual({ allowed: true, limit: 1000, current: 900 });
  });

  it("still allows usage within the 10% grace band over the limit", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "free" }) },
      lead: { count: vi.fn().mockResolvedValue(1050) }
    });
    const service = makeService(client);

    const result = await service.checkContactLimit("ws1");
    expect(result.allowed).toBe(true);
  });

  it("blocks once usage exceeds the 10% grace band", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "free" }) },
      lead: { count: vi.fn().mockResolvedValue(1101) }
    });
    const service = makeService(client);

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
    const service = makeService(client);

    const result = await service.checkUserLimit("ws1");
    expect(result).toEqual({ allowed: false, limit: 1, current: 1 });
  });

  it("allows one seat below the limit", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter" }) },
      membership: { count: vi.fn().mockResolvedValue(1) }
    });
    const service = makeService(client);

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
    const service = makeService(client);

    const result = await service.checkInstagramLimit("ws1");
    expect(result.allowed).toBe(false);
  });
});

describe("UsageService.checkAiCredits", () => {
  it("reads the plan's monthly allotment when no ledger rows exist yet", async () => {
    const client = makeClient({ subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter" }) } });
    const service = makeService(client);

    const result = await service.checkAiCredits("ws1");
    expect(result).toEqual({ allowed: true, remaining: 1000, limit: 1000 });
  });

  it("reads the running ledger balance when one exists", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter" }) },
      creditLedger: { findFirst: vi.fn().mockResolvedValue({ balanceAfter: 40 }), create: vi.fn() }
    });
    const service = makeService(client);

    const result = await service.checkAiCredits("ws1");
    expect(result).toEqual({ allowed: true, remaining: 40, limit: 1000 });
  });

  it("disallows once the balance is exhausted", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "free" }) },
      creditLedger: { findFirst: vi.fn().mockResolvedValue({ balanceAfter: 0 }), create: vi.fn() }
    });
    const service = makeService(client);

    const result = await service.checkAiCredits("ws1");
    expect(result.allowed).toBe(false);
  });
});

describe("UsageService.debitAiCredits", () => {
  it("lazily grants the plan's monthly allotment on first-ever spend, then debits", async () => {
    const client = makeClient({ subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "free" }) } });
    const service = makeService(client);

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
    const service = makeService(client);

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
    const service = makeService(client);

    const result = await service.debitAiCredits("ws1", 1, "ai_reply");

    expect(result).toEqual({ remaining: 0, allowed: false });
    expect(client.creditLedger.create).not.toHaveBeenCalled();
  });

  it("debitAiReplyCredit debits exactly CREDIT_WEIGHTS.aiReply (1 credit)", async () => {
    const client = makeClient({
      subscription: { findUnique: vi.fn().mockResolvedValue({ planId: "starter" }) },
      creditLedger: { findFirst: vi.fn().mockResolvedValue({ balanceAfter: 10 }), create: vi.fn() }
    });
    const service = makeService(client);

    const result = await service.debitAiReplyCredit("ws1");
    expect(result).toEqual({ remaining: 9, allowed: true });
  });
});
