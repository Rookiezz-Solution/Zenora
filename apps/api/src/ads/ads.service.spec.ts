import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { MetaGraphClient } from "../channels/meta-graph.client";
import type { PrismaService } from "../prisma/prisma.service";
import { AdsService } from "./ads.service";
import type { MetaAdsClient } from "./meta-ads.client";

vi.mock("../common/encryption", () => ({
  encryptToken: (v: string) => `enc(${v})`,
  decryptToken: (v: string) => v.replace(/^enc\(|\)$/g, "")
}));

function make(overrides: { client?: Record<string, unknown>; ads?: Record<string, unknown> } = {}) {
  const client = {
    adAccount: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    adDailyStat: { upsert: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    lead: { findMany: vi.fn().mockResolvedValue([]) },
    appointment: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides.client
  };
  const metaAds = {
    redirectUri: () => "http://localhost:4000/ads/meta/callback",
    listAdAccounts: vi.fn().mockResolvedValue([{ externalAccountId: "111", name: "Clinic Ads", currency: "INR" }]),
    fetchInsights: vi.fn().mockResolvedValue([]),
    ...overrides.ads
  };
  const graph = {
    exchangeCodeForUserToken: vi.fn().mockResolvedValue("short"),
    getLongLivedToken: vi.fn().mockResolvedValue({ accessToken: "long-token", expiresInSeconds: 5_184_000 })
  };
  const service = new AdsService({ client } as unknown as PrismaService, metaAds as unknown as MetaAdsClient, graph as unknown as MetaGraphClient);
  return { service, client, metaAds };
}

describe("AdsService.handleCallback", () => {
  it("saves each ad account the user can see as INACTIVE with the token encrypted", async () => {
    const { service, client } = make();
    await service.handleCallback("code", "ws1");

    const data = client.adAccount.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ workspaceId: "ws1", provider: "meta", externalAccountId: "111", status: "inactive", accessTokenCipher: "enc(long-token)", currency: "INR" });
    expect(data.tokenExpiresAt).toBeInstanceOf(Date);
  });

  it("keeps an already-tracked account's status on reconnect, but recovers an errored one", async () => {
    const { service, client } = make({ client: { adAccount: { findUnique: vi.fn().mockResolvedValue({ id: "a1", status: "active" }), update: vi.fn(), create: vi.fn() } } });
    await service.handleCallback("code", "ws1");
    expect(client.adAccount.update.mock.calls[0]![0].data.status).toBe("active");
    expect(client.adAccount.create).not.toHaveBeenCalled();

    const errored = make({ client: { adAccount: { findUnique: vi.fn().mockResolvedValue({ id: "a1", status: "error" }), update: vi.fn(), create: vi.fn() } } });
    await errored.service.handleCallback("code", "ws1");
    expect(errored.client.adAccount.update.mock.calls[0]![0].data.status).toBe("active");
  });
});

describe("AdsService accounts", () => {
  it("answers toggles and removals with a JSON body (the web client parses every response)", async () => {
    const { service } = make();
    await expect(service.setActive("ws1", "a1", true)).resolves.toEqual({ ok: true });
    await expect(service.disconnect("ws1", "a1")).resolves.toEqual({ ok: true });
  });

  it("never selects the access token when listing accounts", async () => {
    const { service, client } = make();
    await service.listAccounts("ws1");
    const select = client.adAccount.findMany.mock.calls[0]![0].select;
    expect(select).not.toHaveProperty("accessTokenCipher");
  });

  it("only changes or removes accounts in the caller's workspace", async () => {
    const { service } = make({ client: { adAccount: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) } } });
    await expect(service.setActive("ws1", "x", true)).rejects.toThrow(NotFoundException);
    await expect(service.disconnect("ws1", "x")).rejects.toThrow(NotFoundException);
  });
});

describe("AdsService.sync", () => {
  const account = { id: "a1", externalAccountId: "111", name: "Clinic Ads", accessTokenCipher: "enc(tok)", status: "active" };
  const row = { date: "2026-10-01", adId: "ad1", adName: "Offer", campaignId: "c1", campaignName: "Diwali", spend: "123.45", impressions: "1000", clicks: "40" };

  it("refuses to sync when no account is being tracked", async () => {
    const { service } = make();
    await expect(service.sync("ws1")).rejects.toThrow(BadRequestException);
  });

  it("upserts per-ad daily stats with spend in minor units and marks the account synced", async () => {
    const { service, client, metaAds } = make({
      client: { adAccount: { findMany: vi.fn().mockResolvedValue([account]), update: vi.fn() } },
      ads: { fetchInsights: vi.fn().mockResolvedValue([row]) }
    });
    const result = await service.sync("ws1");

    expect(result).toEqual({ accounts: 1, rows: 1, errors: [] });
    expect(metaAds.fetchInsights.mock.calls[0]![0]).toBe("tok"); // decrypted
    expect(client.adDailyStat.upsert.mock.calls[0]![0].create).toMatchObject({ spendMinor: 12345, impressions: 1000, clicks: 40, campaignName: "Diwali" });
    expect(client.adAccount.update.mock.calls[0]![0].data).toMatchObject({ status: "active", lastError: null });
  });

  it("marks a failing account as errored but still syncs the others", async () => {
    const second = { ...account, id: "a2", externalAccountId: "222", name: "Second" };
    const fetchInsights = vi.fn().mockRejectedValueOnce(new Error("Meta access expired — reconnect your ad account")).mockResolvedValueOnce([row]);
    const { service, client } = make({ client: { adAccount: { findMany: vi.fn().mockResolvedValue([account, second]), update: vi.fn() } }, ads: { fetchInsights } });

    const result = await service.sync("ws1");

    expect(result.errors).toEqual([{ account: "Clinic Ads", message: "Meta access expired — reconnect your ad account" }]);
    expect(result.rows).toBe(1);
    const updates = client.adAccount.update.mock.calls.map((c) => c[0]);
    expect(updates[0]).toMatchObject({ where: { id: "a1" }, data: { status: "error" } });
    expect(updates[1]).toMatchObject({ where: { id: "a2" }, data: { status: "active" } });
  });
});

describe("AdsService.report", () => {
  it("attributes leads to campaigns via their ad id and counts appointments and wins", async () => {
    const { service } = make({
      client: {
        adDailyStat: {
          findMany: vi.fn().mockResolvedValue([
            { adId: "ad1", campaignId: "c1", campaignName: "Diwali", spendMinor: 200_000, impressions: 100, clicks: 10, adAccount: { currency: "INR" } }
          ])
        },
        lead: {
          findMany: vi.fn().mockResolvedValue([
            { id: "l1", adId: "ad1", source: "whatsapp", stage: { type: "won" } },
            { id: "l2", adId: "ad1", source: "whatsapp", stage: null },
            { id: "l3", adId: null, source: "link_in_bio", stage: null }
          ])
        },
        appointment: { findMany: vi.fn().mockResolvedValue([{ leadId: "l2" }]) }
      }
    });

    const report = await service.report("ws1", 30);

    expect(report.campaigns[0]).toMatchObject({ campaignName: "Diwali", leads: 2, appointments: 1, won: 1, costPerLeadMinor: 100_000, currency: "INR" });
    expect(report.sources).toEqual([
      { source: "ad", leads: 2 },
      { source: "link_in_bio", leads: 1 }
    ]);
  });
});
