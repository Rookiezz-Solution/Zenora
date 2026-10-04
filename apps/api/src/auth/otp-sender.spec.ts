import { ServiceUnavailableException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

function mailer(configured: boolean) {
  return { isConfigured: vi.fn().mockReturnValue(configured), send: vi.fn().mockResolvedValue(undefined) };
}

async function sender(nodeEnv: string, configured = false) {
  vi.resetModules();
  process.env.NODE_ENV = nodeEnv;
  process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
  process.env.TOKEN_ENCRYPTION_KEY = "a1".repeat(32);
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  const { OtpSender } = await import("./otp-sender");
  const m = mailer(configured);
  return { s: new OtpSender(m as never), m };
}

describe("OtpSender", () => {
  const saved = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = saved;
  });

  it("outside development with no email server, refuses and never logs the code", async () => {
    const { s } = await sender("production");
    const warn = vi.spyOn((s as unknown as { logger: { warn: (m: string) => void } }).logger, "warn");
    await expect(s.send("a@b.co", "123456")).rejects.toThrow(ServiceUnavailableException);
    expect(warn).not.toHaveBeenCalled();
  });

  it("in development with no email server, logs the code so sign-in can be tried locally", async () => {
    const { s } = await sender("development");
    const warn = vi.spyOn((s as unknown as { logger: { warn: (m: string) => void } }).logger, "warn").mockImplementation(() => undefined);
    await s.send("a@b.co", "123456");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("123456"));
  });

  it("emails the code when an email server is configured, in every environment", async () => {
    const { s, m } = await sender("production", true);
    await s.send("ravi@x.co", "654321", "password_reset");
    expect(m.send).toHaveBeenCalledTimes(1);
    const msg = m.send.mock.calls[0]![0];
    expect(msg).toMatchObject({ to: "ravi@x.co" });
    expect(msg.text).toContain("654321");
    expect(msg.text).toContain("reset your Zenora password");
    expect(msg.text).toContain("10 minutes");
  });

  it("does not email a phone number, and does not log the code in production even if email is set up", async () => {
    const { s, m } = await sender("production", true);
    await expect(s.send("+919800000000", "123456")).rejects.toThrow(ServiceUnavailableException);
    expect(m.send).not.toHaveBeenCalled();
  });

  it("canDeliver is true for an email only when email is set up (or in development)", async () => {
    expect((await sender("production", true)).s.canDeliver("a@b.co")).toBe(true);
    expect((await sender("production", false)).s.canDeliver("a@b.co")).toBe(false);
    expect((await sender("production", true)).s.canDeliver("+919800000000")).toBe(false);
    expect((await sender("development", false)).s.canDeliver("a@b.co")).toBe(true);
  });
});
