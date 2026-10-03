import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Wrap compare so a test can see whether password hashing work was done.
vi.mock("bcryptjs", async (importOriginal) => {
  const mod = await importOriginal<{ default?: typeof import("bcryptjs") } & typeof import("bcryptjs")>();
  const real = mod.default ?? mod;
  return { ...real, default: real, compare: vi.fn(real.compare) };
});

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
  process.env.TOKEN_ENCRYPTION_KEY = "a1".repeat(32);
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

async function make(client: Record<string, unknown>) {
  const { AuthService } = await import("./auth.service");
  return new AuthService({ client } as never, { send: vi.fn() } as never);
}
const baseUser = { id: "u1", email: "victim@example.com", sessionVersion: 0, passwordHash: null, emailVerifiedAt: null };

describe("AuthService.login", () => {
  it("rejects an unknown email and a wrong password identically", async () => {
    const hash = await bcrypt.hash("right-password", 4);
    const known = await make({ user: { findUnique: vi.fn().mockResolvedValue({ ...baseUser, passwordHash: hash }) } });
    const unknown = await make({ user: { findUnique: vi.fn().mockResolvedValue(null) } });

    const a = await known.login({ email: "victim@example.com", password: "wrong" }).catch((e) => e);
    const b = await unknown.login({ email: "nobody@example.com", password: "wrong" }).catch((e) => e);
    expect(a).toBeInstanceOf(UnauthorizedException);
    expect(b).toBeInstanceOf(UnauthorizedException);
    expect(a.message).toBe(b.message);
  });

  it("spends the same password-hashing work on an unknown email (no timing leak)", async () => {
    const spy = vi.mocked(bcrypt.compare);
    spy.mockClear();
    const unknown = await make({ user: { findUnique: vi.fn().mockResolvedValue(null) } });
    await unknown.login({ email: "nobody@example.com", password: "x" }).catch(() => undefined);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("signs the session with the account's current version", async () => {
    const hash = await bcrypt.hash("pw-12345678", 4);
    const svc = await make({ user: { findUnique: vi.fn().mockResolvedValue({ ...baseUser, passwordHash: hash, sessionVersion: 3 }) } });
    const { token } = await svc.login({ email: "victim@example.com", password: "pw-12345678" });
    const { verifySession } = await import("./jwt.util");
    expect(verifySession(token)).toMatchObject({ sub: "u1", ver: 3 });
  });
});

describe("account pre-hijacking", () => {
  const upsert = vi.fn().mockImplementation(({ update }) => Promise.resolve({ ...baseUser, sessionVersion: update.sessionVersion ? 1 : 0 }));

  it("removes the password and signs out old sessions when the real owner proves the email by Google", async () => {
    upsert.mockClear();
    const svc = await make({ user: { findUnique: vi.fn().mockResolvedValue({ id: "u1", emailVerifiedAt: null, passwordHash: "attacker-set-hash" }), upsert } });
    await svc.validateOrCreateGoogleUser({ googleId: "g1", email: "victim@example.com" });
    expect(upsert.mock.calls[0]![0].update).toMatchObject({ passwordHash: null, sessionVersion: { increment: 1 }, emailVerifiedAt: expect.any(Date) });
  });

  it("does the same for an email-code login", async () => {
    upsert.mockClear();
    const record = { id: "o1", expiresAt: new Date(Date.now() + 60_000), attempts: 0, codeHash: await bcrypt.hash("123456", 4) };
    const svc = await make({
      otpCode: { findFirst: vi.fn().mockResolvedValue(record), update: vi.fn() },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "u1", emailVerifiedAt: null, passwordHash: "attacker-set-hash" }), upsert }
    });
    await svc.verifyOtp({ target: "victim@example.com", purpose: "login", code: "123456" } as never);
    expect(upsert.mock.calls[0]![0].update).toMatchObject({ passwordHash: null, sessionVersion: { increment: 1 } });
  });

  it("leaves an already-verified account's password and sessions alone", async () => {
    upsert.mockClear();
    const svc = await make({ user: { findUnique: vi.fn().mockResolvedValue({ id: "u1", emailVerifiedAt: new Date(), passwordHash: "legit" }), upsert } });
    await svc.validateOrCreateGoogleUser({ googleId: "g1", email: "victim@example.com" });
    const update = upsert.mock.calls[0]![0].update;
    expect(update.passwordHash).toBeUndefined();
    expect(update.sessionVersion).toBeUndefined();
  });
});
