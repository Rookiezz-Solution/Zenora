import { BadRequestException } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
  process.env.TOKEN_ENCRYPTION_KEY = "a1".repeat(32);
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

function fakeRes() {
  const cookies: Record<string, string> = {};
  return {
    cookies,
    cleared: [] as string[],
    cookie(name: string, value: string) {
      cookies[name] = value;
    },
    clearCookie(name: string) {
      this.cleared.push(name);
    }
  };
}
const reqWith = (cookies: Record<string, string>) => ({ cookies }) as never;

describe("OAuth state binding", () => {
  it("completes when the callback arrives in the browser that started the flow, and returns only the payload", async () => {
    const { beginOAuth, completeOAuth } = await import("./oauth-state");
    const res = fakeRes();
    const state = beginOAuth(res as never, { workspaceId: "ws1", userId: "u1" });

    const payload = completeOAuth<{ workspaceId: string; userId: string }>(reqWith(res.cookies), res as never, state);
    expect(payload).toEqual({ workspaceId: "ws1", userId: "u1" });
    expect(res.cleared).toContain("zenora_oauth_nonce"); // single use
  });

  it("rejects a callback from a different browser (the cross-account attach attack)", async () => {
    const { beginOAuth, completeOAuth } = await import("./oauth-state");
    const attackerRes = fakeRes();
    const state = beginOAuth(attackerRes as never, { workspaceId: "attackers-ws", userId: "attacker" });

    // The victim's browser never received the attacker's cookie.
    expect(() => completeOAuth(reqWith({}), fakeRes() as never, state)).toThrow(BadRequestException);
    expect(() => completeOAuth(reqWith({ zenora_oauth_nonce: "some-other-value" }), fakeRes() as never, state)).toThrow(BadRequestException);
  });

  it("rejects an expired, tampered, or wrong-kind token", async () => {
    const { completeOAuth } = await import("./oauth-state");
    const secret = process.env.AUTH_SECRET!;
    const expired = jwt.sign({ workspaceId: "w", userId: "u", nonce: "n" }, secret, { expiresIn: -10, audience: "zenora:oauth" });
    expect(() => completeOAuth(reqWith({ zenora_oauth_nonce: "n" }), fakeRes() as never, expired)).toThrow(BadRequestException);

    const wrongKey = jwt.sign({ workspaceId: "w", userId: "u", nonce: "n" }, "another-secret-at-least-16", { audience: "zenora:oauth" });
    expect(() => completeOAuth(reqWith({ zenora_oauth_nonce: "n" }), fakeRes() as never, wrongKey)).toThrow(BadRequestException);

    // A session token must not be usable as OAuth state.
    const sessionToken = jwt.sign({ sub: "u", ver: 0 }, secret, { audience: "zenora:session" });
    expect(() => completeOAuth(reqWith({ zenora_oauth_nonce: "n" }), fakeRes() as never, sessionToken)).toThrow(BadRequestException);
  });
});
