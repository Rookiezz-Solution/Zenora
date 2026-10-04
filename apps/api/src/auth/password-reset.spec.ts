import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { changePasswordSchema, otpRequestSchema, otpVerifySchema, passwordResetSchema } from "./dto/auth.dto";

// Real bcrypt is slow on a busy machine.
vi.setConfig({ testTimeout: 30_000 });

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
  process.env.TOKEN_ENCRYPTION_KEY = "a1".repeat(32);
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

async function make(client: Record<string, unknown>, sender: Record<string, unknown> = {}) {
  const { AuthService } = await import("./auth.service");
  const otpSender = { canDeliver: vi.fn().mockReturnValue(true), send: vi.fn().mockResolvedValue(undefined), ...sender };
  return { service: new AuthService({ client } as never, otpSender as never), otpSender };
}

const userRow = (over: Record<string, unknown> = {}) => ({ id: "u1", email: "ravi@x.co", passwordHash: null, sessionVersion: 3, emailVerifiedAt: null, ...over });

describe("requesting a password-reset code", () => {
  it("sends a code to an existing account and records it", async () => {
    const create = vi.fn();
    const { service, otpSender } = await make({ user: { findUnique: vi.fn().mockResolvedValue(userRow()) }, otpCode: { create } });
    expect(await service.requestOtp({ target: "ravi@x.co", purpose: "password_reset" })).toEqual({ sent: true, expiresInMinutes: 10 });
    expect(create.mock.calls[0]![0].data).toMatchObject({ target: "ravi@x.co", purpose: "password_reset" });
    expect(otpSender.send).toHaveBeenCalledWith("ravi@x.co", expect.stringMatching(/^\d{6}$/), "password_reset");
  });

  it("answers the same for an address with no account, and sends nothing", async () => {
    const create = vi.fn();
    const { service, otpSender } = await make({ user: { findUnique: vi.fn().mockResolvedValue(null) }, otpCode: { create } });
    expect(await service.requestOtp({ target: "nobody@x.co", purpose: "password_reset" })).toEqual({ sent: true, expiresInMinutes: 10 });
    expect(create).not.toHaveBeenCalled();
    expect(otpSender.send).not.toHaveBeenCalled();
  });

  it("answers the same when sending fails, so a delivery problem cannot reveal which addresses have accounts", async () => {
    const failing = { send: vi.fn().mockRejectedValue(new ServiceUnavailableException("We couldn't send the email.")) };
    const real = await make({ user: { findUnique: vi.fn().mockResolvedValue(userRow()) }, otpCode: { create: vi.fn() } }, failing);
    const unknown = await make({ user: { findUnique: vi.fn().mockResolvedValue(null) }, otpCode: { create: vi.fn() } }, failing);
    const a = await real.service.requestOtp({ target: "ravi@x.co", purpose: "password_reset" });
    const b = await unknown.service.requestOtp({ target: "nobody@x.co", purpose: "password_reset" });
    expect(a).toEqual(b);
  });

  it("still reports a delivery failure for ordinary sign-in codes", async () => {
    const failing = { send: vi.fn().mockRejectedValue(new ServiceUnavailableException("We couldn't send the email.")) };
    const { service } = await make({ otpCode: { create: vi.fn() } }, failing);
    await expect(service.requestOtp({ target: "ravi@x.co", purpose: "login" })).rejects.toThrow(ServiceUnavailableException);
  });

  it("refuses everyone alike, before looking anyone up, when no code can be delivered", async () => {
    const findUnique = vi.fn();
    const { service } = await make({ user: { findUnique }, otpCode: { create: vi.fn() } }, { canDeliver: vi.fn().mockReturnValue(false) });
    await expect(service.requestOtp({ target: "ravi@x.co", purpose: "password_reset" })).rejects.toThrow(ServiceUnavailableException);
    expect(findUnique).not.toHaveBeenCalled(); // so the refusal cannot reveal who has an account
  });
});

describe("resetting a password", () => {
  const otp = async (code: string) => ({ id: "o1", codeHash: await bcrypt.hash(code, 4), expiresAt: new Date(Date.now() + 60_000), attempts: 0 });

  it("with the right code sets the new password, verifies the email, signs every other device out and signs this one in", async () => {
    const update = vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(userRow({ passwordHash: data.passwordHash, sessionVersion: 4 })));
    const otpUpdate = vi.fn();
    const { service } = await make({
      otpCode: { findFirst: vi.fn().mockResolvedValue(await otp("123456")), update: otpUpdate },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "u1" }), update }
    });
    const r = await service.resetPassword({ email: "ravi@x.co", code: "123456", newPassword: "a-new-password" });
    const data = update.mock.calls[0]![0].data;
    expect(await bcrypt.compare("a-new-password", data.passwordHash)).toBe(true);
    expect(data.sessionVersion).toEqual({ increment: 1 });
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(otpUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { consumedAt: expect.any(Date) } }); // the code is used up
    expect(r.token).toBeTruthy();
    expect(JSON.stringify(r.user)).not.toContain("passwordHash");
  });

  it("rejects a wrong code, counts the attempt, and changes nothing", async () => {
    const update = vi.fn();
    const otpUpdate = vi.fn();
    const { service } = await make({ otpCode: { findFirst: vi.fn().mockResolvedValue(await otp("123456")), update: otpUpdate }, user: { findUnique: vi.fn(), update } });
    await expect(service.resetPassword({ email: "ravi@x.co", code: "000000", newPassword: "a-new-password" })).rejects.toThrow(UnauthorizedException);
    expect(otpUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { attempts: { increment: 1 } } });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an expired, used-up or guessed-out code", async () => {
    const expired = { ...(await otp("123456")), expiresAt: new Date(Date.now() - 1000) };
    const guessedOut = { ...(await otp("123456")), attempts: 5 };
    for (const record of [expired, guessedOut, null]) {
      const update = vi.fn();
      const { service } = await make({ otpCode: { findFirst: vi.fn().mockResolvedValue(record), update: vi.fn() }, user: { findUnique: vi.fn(), update } });
      await expect(service.resetPassword({ email: "ravi@x.co", code: "123456", newPassword: "a-new-password" })).rejects.toThrow(UnauthorizedException);
      expect(update).not.toHaveBeenCalled();
    }
  });

  it("uses a code only for password reset, never for signing in", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const { service } = await make({ otpCode: { findFirst, update: vi.fn() }, user: { findUnique: vi.fn(), update: vi.fn() } });
    await service.resetPassword({ email: "ravi@x.co", code: "123456", newPassword: "a-new-password" }).catch(() => undefined);
    expect(findFirst.mock.calls[0]![0].where).toMatchObject({ target: "ravi@x.co", purpose: "password_reset", consumedAt: null });
  });
});

describe("changing your own password", () => {
  it("needs the current password when the account has one", async () => {
    const hash = await bcrypt.hash("old-password", 4);
    const update = vi.fn();
    const { service } = await make({ user: { findUniqueOrThrow: vi.fn().mockResolvedValue(userRow({ passwordHash: hash })), update } });
    await expect(service.changePassword("u1", { currentPassword: "wrong", newPassword: "a-new-password" })).rejects.toThrow("current password is incorrect");
    await expect(service.changePassword("u1", { newPassword: "a-new-password" })).rejects.toThrow(UnauthorizedException);
    expect(update).not.toHaveBeenCalled();
  });

  it("with the right current password sets the new one and starts a fresh session", async () => {
    const hash = await bcrypt.hash("old-password", 4);
    const update = vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(userRow({ passwordHash: data.passwordHash, sessionVersion: 4 })));
    const { service } = await make({ user: { findUniqueOrThrow: vi.fn().mockResolvedValue(userRow({ passwordHash: hash })), update } });
    const r = await service.changePassword("u1", { currentPassword: "old-password", newPassword: "a-new-password" });
    expect(update.mock.calls[0]![0].data.sessionVersion).toEqual({ increment: 1 });
    expect(await bcrypt.compare("a-new-password", update.mock.calls[0]![0].data.passwordHash)).toBe(true);
    expect(r.token).toBeTruthy();
  });

  it("lets an account that has never had a password (Google or code sign-in) set one", async () => {
    const update = vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(userRow({ passwordHash: data.passwordHash, sessionVersion: 4 })));
    const { service } = await make({ user: { findUniqueOrThrow: vi.fn().mockResolvedValue(userRow({ passwordHash: null })), update } });
    await expect(service.changePassword("u1", { newPassword: "first-password" })).resolves.toBeDefined();
    expect(update).toHaveBeenCalled();
  });
});

describe("request validation", () => {
  it("a reset code can only be asked for with an email address", () => {
    expect(otpRequestSchema.safeParse({ target: "ravi@x.co", purpose: "password_reset" }).success).toBe(true);
    expect(otpRequestSchema.safeParse({ target: "+919800000000", purpose: "password_reset" }).success).toBe(false);
    expect(otpRequestSchema.safeParse({ target: "+919800000000", purpose: "login" }).success).toBe(true);
  });

  it("a reset code cannot be used to sign in through the normal code endpoint", () => {
    expect(otpVerifySchema.safeParse({ target: "ravi@x.co", code: "123456", purpose: "password_reset" }).success).toBe(false);
  });

  it("new passwords must be 8-200 characters", () => {
    expect(passwordResetSchema.safeParse({ email: "a@b.co", code: "123456", newPassword: "short" }).success).toBe(false);
    expect(passwordResetSchema.safeParse({ email: "a@b.co", code: "123456", newPassword: "x".repeat(201) }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ newPassword: "long-enough" }).success).toBe(true);
  });
});
