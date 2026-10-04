import { BadRequestException, ConflictException } from "@nestjs/common";
import { DEFAULT_PLAN_CONFIG, getPlanConfig, setPlanConfig } from "@zenora/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { PlanConfigService } from "./plan-config.service";

afterEach(() => setPlanConfig(DEFAULT_PLAN_CONFIG));

function make(opts: { stored?: unknown; subs?: { workspaceId: string }[]; leads?: { workspaceId: string; _count: { _all: number } }[]; members?: { workspaceId: string; _count: { _all: number } }[] } = {}) {
  const client = {
    planConfigOverride: {
      findUnique: vi.fn().mockResolvedValue(opts.stored ? { data: opts.stored, updatedAt: new Date() } : null),
      upsert: vi.fn(),
      deleteMany: vi.fn()
    },
    subscription: { findMany: vi.fn().mockResolvedValue(opts.subs ?? []), groupBy: vi.fn().mockResolvedValue([]) },
    workspace: { count: vi.fn().mockResolvedValue(0) },
    lead: { groupBy: vi.fn().mockResolvedValue(opts.leads ?? []) },
    membership: { groupBy: vi.fn().mockResolvedValue(opts.members ?? []) },
    instagramAccount: { groupBy: vi.fn().mockResolvedValue([]) },
    platformAuditLog: { create: vi.fn() }
  };
  return { service: new PlanConfigService({ client } as unknown as PrismaService), client };
}

describe("PlanConfigService.refresh", () => {
  it("applies stored overrides over the defaults, and falls back to defaults with none", async () => {
    await make({ stored: { plans: { growth: { priceInr: 4499 } } } }).service.refresh();
    expect(getPlanConfig().plans.growth.priceInr).toBe(4499);
    await make().service.refresh();
    expect(getPlanConfig().plans.growth.priceInr).toBe(3999);
  });
});

describe("PlanConfigService.update", () => {
  it("stores only what differs from the defaults, applies it immediately, and audits it", async () => {
    const { service, client } = make();
    await service.update("admin1", { plans: { starter: { priceInr: 1599, users: 2 } }, addonPrices: { extraUser: 399 } }, { note: "Diwali pricing" });

    expect(client.planConfigOverride.upsert.mock.calls[0]![0].create.data).toEqual({ plans: { starter: { priceInr: 1599 } } }); // users 2 and extraUser 399 are the defaults
    expect(getPlanConfig().plans.starter.priceInr).toBe(1599);
    expect(client.platformAuditLog.create.mock.calls[0]![0].data).toMatchObject({ userId: "admin1", action: "plans.updated", detail: "starter priceInr: 1499 → 1599 (Diwali pricing)" });
  });

  it("refuses invalid values and illogical tiers, changing nothing", async () => {
    const { service, client } = make();
    await expect(service.update("admin1", { plans: { starter: { priceInr: 5 } } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update("admin1", { plans: { pro: { priceInr: 3000 } } })).rejects.toThrow("Pro must cost more than Growth.");
    await expect(service.update("admin1", { plans: { free: { priceInr: 99 } } })).rejects.toBeInstanceOf(BadRequestException);
    expect(client.planConfigOverride.upsert).not.toHaveBeenCalled();
    expect(getPlanConfig().plans.pro.priceInr).toBe(8999);
  });

  it("needs an explicit confirmation for a price change of more than 25%", async () => {
    const { service, client } = make();
    const error = await service.update("admin1", { plans: { growth: { priceInr: 6000 } } }).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ requiresConfirmation: true });
    expect(client.planConfigOverride.upsert).not.toHaveBeenCalled();

    await service.update("admin1", { plans: { growth: { priceInr: 6000 } } }, { confirmLargePriceChange: true });
    expect(getPlanConfig().plans.growth.priceInr).toBe(6000);
  });

  it("refuses to lower a limit while a workspace on that plan is already above it", async () => {
    const { service, client } = make({ subs: [{ workspaceId: "w1" }, { workspaceId: "w2" }], leads: [{ workspaceId: "w1", _count: { _all: 23_000 } }, { workspaceId: "w2", _count: { _all: 400 } }] });
    const error = await service.update("admin1", { plans: { growth: { contacts: 20_000 } } }).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse().blocked).toEqual([{ label: "growth contacts 20000", workspaces: 1 }]);
    expect(client.planConfigOverride.upsert).not.toHaveBeenCalled();
    expect(getPlanConfig().plans.growth.contacts).toBe(25_000);
  });

  it("allows lowering a limit once nobody is above the new figure, and raising one always", async () => {
    const { service } = make({ subs: [{ workspaceId: "w1" }], leads: [{ workspaceId: "w1", _count: { _all: 400 } }] });
    await service.update("admin1", { plans: { growth: { contacts: 20_000 } } });
    expect(getPlanConfig().plans.growth.contacts).toBe(20_000);
    await service.update("admin1", { plans: { growth: { contacts: 40_000 } } });
    expect(getPlanConfig().plans.growth.contacts).toBe(40_000);
  });

  it("does nothing, and writes no audit entry, when nothing changes", async () => {
    const { service, client } = make();
    await service.update("admin1", {});
    expect(client.planConfigOverride.upsert).not.toHaveBeenCalled();
    expect(client.platformAuditLog.create).not.toHaveBeenCalled();
  });
});

describe("PlanConfigService.reset", () => {
  it("removes the overrides and returns to the defaults, audited", async () => {
    setPlanConfig({ ...DEFAULT_PLAN_CONFIG, addonPrices: { ...DEFAULT_PLAN_CONFIG.addonPrices, extraUser: 449 } });
    const { service, client } = make();
    await service.reset("admin1");
    expect(client.planConfigOverride.deleteMany).toHaveBeenCalledWith({ where: { id: "plans" } });
    expect(getPlanConfig().addonPrices.extraUser).toBe(399);
    expect(client.platformAuditLog.create.mock.calls[0]![0].data).toMatchObject({ action: "plans.reset" });
  });
});
