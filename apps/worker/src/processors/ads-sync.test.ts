import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  adAccount: { findMany: vi.fn(), update: vi.fn() },
  adDailyStat: { upsert: vi.fn() },
  $transaction: vi.fn()
}));
vi.mock("@zenora/db", () => ({ prisma: prismaMock }));
vi.mock("../decrypt-token", () => ({ decryptToken: (c: string) => `plain:${c}` }));

import { processAdsSync } from "./ads-sync";

const now = new Date("2026-10-10T12:00:00Z");
const account = (id: string) => ({ id, workspaceId: "ws1", externalAccountId: `ext-${id}`, accessTokenCipher: `cipher-${id}` });
const insightsBody = (rows: { ad: string; spend: string }[]) => ({
  ok: true,
  json: () => Promise.resolve({ data: rows.map((r) => ({ date_start: "2026-10-09", ad_id: r.ad, ad_name: "Ad " + r.ad, campaign_id: "c1", campaign_name: "Camp", spend: r.spend, impressions: "1000", clicks: "40" })) })
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.adAccount.findMany.mockResolvedValue([account("a1")]);
  prismaMock.adAccount.update.mockResolvedValue({});
  prismaMock.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
  prismaMock.adDailyStat.upsert.mockImplementation((args: unknown) => Promise.resolve(args));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(insightsBody([{ ad: "ad1", spend: "12.50" }, { ad: "ad2", spend: "3" }])));
});
afterEach(() => vi.unstubAllGlobals());

describe("processAdsSync", () => {
  it("pulls the last 7 days for each due account with its decrypted token", async () => {
    await processAdsSync(now);
    const url = new URL(String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]));
    expect(url.pathname).toMatch(/\/act_ext-a1\/insights$/);
    expect(url.searchParams.get("access_token")).toBe("plain:cipher-a1");
    expect(JSON.parse(url.searchParams.get("time_range")!)).toEqual({ since: "2026-10-03", until: "2026-10-10" });
  });

  it("stores each ad-day once (upsert) with spend in minor units, and marks the account synced", async () => {
    const r = await processAdsSync(now);
    expect(r).toEqual({ accounts: 1, rows: 2, failed: 0 });
    const first = prismaMock.adDailyStat.upsert.mock.calls[0]![0];
    expect(first.where).toEqual({ adAccountId_date_adId: { adAccountId: "a1", date: "2026-10-09", adId: "ad1" } });
    expect(first.create).toMatchObject({ workspaceId: "ws1", adAccountId: "a1", spendMinor: 1250, impressions: 1000, clicks: 40, campaignName: "Camp" });
    expect(first.update.spendMinor).toBe(1250);
    expect(prismaMock.adAccount.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { status: "active", lastError: null, lastSyncedAt: now } });
  });

  it("only picks accounts that are tracked, connected, and not synced in the last 5 hours", async () => {
    await processAdsSync(now);
    const where = prismaMock.adAccount.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ provider: "meta", status: { in: ["active", "error"] }, accessTokenCipher: { not: null } });
    expect(where.OR).toEqual([{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date("2026-10-10T07:00:00Z") } }]);
  });

  it("marks an account whose access has expired, and still syncs the others", async () => {
    prismaMock.adAccount.findMany.mockResolvedValue([account("bad"), account("good")]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 400, json: () => Promise.resolve({ error: { code: 190, message: "expired" } }) })
      .mockResolvedValueOnce(insightsBody([{ ad: "ad1", spend: "1" }]));
    vi.stubGlobal("fetch", fetchMock);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await processAdsSync(now);
    spy.mockRestore();
    expect(r).toEqual({ accounts: 2, rows: 1, failed: 1 });
    expect(prismaMock.adAccount.update).toHaveBeenCalledWith({ where: { id: "bad" }, data: { status: "error", lastError: "Meta access expired — reconnect your ad account" } });
    expect(prismaMock.adAccount.update).toHaveBeenCalledWith({ where: { id: "good" }, data: { status: "active", lastError: null, lastSyncedAt: now } });
  });

  it("does nothing when no account is due", async () => {
    prismaMock.adAccount.findMany.mockResolvedValue([]);
    expect(await processAdsSync(now)).toEqual({ accounts: 0, rows: 0, failed: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
