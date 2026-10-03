import { BadRequestException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function makeClient(env: Record<string, string> = {}) {
  process.env = {
    ...ORIGINAL_ENV,
    DATABASE_URL: "postgresql://x",
    AUTH_SECRET: "a".repeat(32),
    TOKEN_ENCRYPTION_KEY: "a".repeat(64),
    API_URL: "http://localhost:4000",
    META_APP_ID: "app123",
    META_GRAPH_API_VERSION: "v21.0",
    ...env
  };
  vi.resetModules();
  const { MetaAdsClient } = await import("./meta-ads.client");
  return new MetaAdsClient();
}

const respond = (body: unknown, ok = true) => vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 400, json: () => Promise.resolve(body) });

describe("MetaAdsClient", () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.unstubAllGlobals();
  });

  it("gives a clear 400 when the Meta app isn't configured yet", async () => {
    const client = await makeClient({ META_APP_ID: "" });
    expect(() => client.buildAuthUrl("s")).toThrow(BadRequestException);
  });

  it("asks only for read-only ad access", async () => {
    const client = await makeClient();
    const url = new URL(client.buildAuthUrl("signed"));
    expect(url.searchParams.get("scope")).toBe("ads_read");
    expect(url.searchParams.get("client_id")).toBe("app123");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:4000/ads/meta/callback");
    expect(url.searchParams.get("state")).toBe("signed");
  });

  it("lists ad accounts", async () => {
    vi.stubGlobal("fetch", respond({ data: [{ account_id: "111", name: "Clinic", currency: "INR" }] }));
    const client = await makeClient();
    await expect(client.listAdAccounts("tok")).resolves.toEqual([{ externalAccountId: "111", name: "Clinic", currency: "INR" }]);
  });

  it("follows paging.next and normalises insight rows", async () => {
    const row = (id: string) => ({ date_start: "2026-10-01", ad_id: id, ad_name: "n", campaign_id: "c1", campaign_name: "Diwali", spend: "1.5", impressions: "10", clicks: "2" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [row("a1")], paging: { next: "https://graph.facebook.com/next-page" } }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [row("a2")] }) });
    vi.stubGlobal("fetch", fetchMock);
    const client = await makeClient();

    const rows = await client.fetchInsights("tok", "111", "2026-09-01", "2026-10-01");

    expect(rows.map((r) => r.adId)).toEqual(["a1", "a2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/act_111/insights");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("level=ad");
  });

  it("turns an expired-token error into a reconnect message", async () => {
    vi.stubGlobal("fetch", respond({ error: { code: 190, message: "Session has expired" } }, false));
    const client = await makeClient();
    await expect(client.listAdAccounts("tok")).rejects.toThrow("reconnect your ad account");
  });

  it("surfaces other Meta errors", async () => {
    vi.stubGlobal("fetch", respond({ error: { code: 4, message: "Rate limited" } }, false));
    const client = await makeClient();
    await expect(client.listAdAccounts("tok")).rejects.toThrow("Rate limited");
  });
});
