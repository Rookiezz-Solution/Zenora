import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
  process.env.TOKEN_ENCRYPTION_KEY = "a1".repeat(32);
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

const COOKIE = "zenora_session";
function ctxWith(token?: string) {
  const req: { cookies: Record<string, string>; userId?: string } = { cookies: token ? { [COOKIE]: token } : {} };
  return { ctx: { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext, req };
}

async function setup(version: number | null) {
  vi.resetModules();
  const { JwtAuthGuard, forgetSessionVersion } = await import("./guards/jwt-auth.guard");
  const { signSession } = await import("./jwt.util");
  const findUnique = vi.fn().mockResolvedValue(version === null ? null : { sessionVersion: version });
  const guard = new JwtAuthGuard({ client: { user: { findUnique } } } as never);
  return { guard, findUnique, signSession, forgetSessionVersion };
}

describe("JwtAuthGuard", () => {
  beforeEach(() => {
    process.env.SESSION_COOKIE_NAME = COOKIE;
  });

  it("accepts a session whose version is current, and exposes the user id", async () => {
    const { guard, signSession } = await setup(0);
    const { ctx, req } = ctxWith(signSession({ sub: "u1", ver: 0 }));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.userId).toBe("u1");
  });

  it("rejects a missing cookie, garbage, and a token of the wrong kind", async () => {
    const { guard } = await setup(0);
    await expect(guard.canActivate(ctxWith().ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctxWith("garbage").ctx)).rejects.toThrow(UnauthorizedException);
    const oauthLike = jwt.sign({ sub: "u1", ver: 0 }, process.env.AUTH_SECRET!, { audience: "zenora:oauth" });
    await expect(guard.canActivate(ctxWith(oauthLike).ctx)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects tokens from before the version was introduced (no ver claim)", async () => {
    const { guard } = await setup(0);
    const legacy = jwt.sign({ sub: "u1" }, process.env.AUTH_SECRET!, { audience: "zenora:session" });
    await expect(guard.canActivate(ctxWith(legacy).ctx)).rejects.toThrow(UnauthorizedException);
  });

  it("signs out sessions once the account's version has moved on, and for deleted users", async () => {
    const stale = await setup(1); // account is now at version 1
    await expect(stale.guard.canActivate(ctxWith(stale.signSession({ sub: "u1", ver: 0 })).ctx)).rejects.toThrow(UnauthorizedException);

    const gone = await setup(null);
    await expect(gone.guard.canActivate(ctxWith(gone.signSession({ sub: "u1", ver: 0 })).ctx)).rejects.toThrow(UnauthorizedException);
  });

  it("looks the version up once, then trusts it briefly, until it is explicitly forgotten", async () => {
    const { guard, findUnique, signSession, forgetSessionVersion } = await setup(0);
    const token = signSession({ sub: "u1", ver: 0 });
    await guard.canActivate(ctxWith(token).ctx);
    await guard.canActivate(ctxWith(token).ctx);
    expect(findUnique).toHaveBeenCalledTimes(1);
    forgetSessionVersion("u1");
    await guard.canActivate(ctxWith(token).ctx);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});
