import { BadRequestException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function respond(body: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) }));
}

async function makeClient(env: Record<string, string> = {}) {
  process.env = {
    ...ORIGINAL_ENV,
    DATABASE_URL: "postgresql://x",
    AUTH_SECRET: "a".repeat(32),
    TOKEN_ENCRYPTION_KEY: "a".repeat(64),
    API_URL: "http://localhost:4000",
    GOOGLE_CLIENT_ID: "cid",
    GOOGLE_CLIENT_SECRET: "secret",
    ...env
  };
  vi.resetModules();
  const { GoogleCalendarClient } = await import("./google-calendar.client");
  return new GoogleCalendarClient();
}

describe("GoogleCalendarClient", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.unstubAllGlobals();
  });

  it("gives a clear 400 (not a 500) when Google isn't configured", async () => {
    const client = await makeClient({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" });
    expect(() => client.buildAuthUrl("state")).toThrow(BadRequestException);
  });

  it("builds a consent URL that asks for offline access and calendar scopes", async () => {
    const client = await makeClient();
    const url = new URL(client.buildAuthUrl("signed-state"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:4000/calendar/google/callback");
    expect(url.searchParams.get("scope")).toContain("calendar.events");
  });

  it("exchanges a code for a refresh token and reads the account email", async () => {
    const idToken = `h.${Buffer.from(JSON.stringify({ email: "asha@example.com" })).toString("base64url")}.s`;
    respond({ access_token: "a", refresh_token: "r", id_token: idToken });
    const client = await makeClient();
    await expect(client.exchangeCode("code")).resolves.toEqual({ refreshToken: "r", email: "asha@example.com" });
  });

  it("errors if Google returns no refresh token", async () => {
    respond({ access_token: "a" });
    const client = await makeClient();
    await expect(client.exchangeCode("code")).rejects.toThrow("refresh token");
  });

  it("parses busy intervals from freeBusy", async () => {
    respond({ calendars: { primary: { busy: [{ start: "2026-10-05T04:30:00Z", end: "2026-10-05T05:00:00Z" }] } } });
    const client = await makeClient();
    const busy = await client.freeBusy("tok", new Date("2026-10-05T00:00:00Z"), new Date("2026-10-06T00:00:00Z"));
    expect(busy).toEqual([{ start: Date.parse("2026-10-05T04:30:00Z"), end: Date.parse("2026-10-05T05:00:00Z") }]);
  });

  it("creates an event and returns its id; surfaces API failures", async () => {
    respond({ id: "evt1" });
    const client = await makeClient();
    const event = { summary: "Consult", startsAt: new Date("2026-10-05T04:30:00Z"), endsAt: new Date("2026-10-05T05:00:00Z") };
    await expect(client.createEvent("tok", event)).resolves.toBe("evt1");

    respond({ error: "forbidden" }, false);
    await expect(client.createEvent("tok", event)).rejects.toThrow("event creation failed");
  });
});
