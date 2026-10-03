import { ServiceUnavailableException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

async function sender(nodeEnv: string) {
  vi.resetModules();
  process.env.NODE_ENV = nodeEnv;
  process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
  process.env.TOKEN_ENCRYPTION_KEY = "a1".repeat(32);
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  const { OtpSender } = await import("./otp-sender");
  return new OtpSender();
}

describe("OtpSender (stub)", () => {
  const saved = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = saved;
  });

  it("outside development refuses, and never logs the code", async () => {
    const s = await sender("production");
    const warn = vi.spyOn((s as unknown as { logger: { warn: (m: string) => void } }).logger, "warn");
    await expect(s.send("a@b.co", "123456")).rejects.toThrow(ServiceUnavailableException);
    expect(warn).not.toHaveBeenCalled();
  });

  it("in development logs the code so login can be tried locally", async () => {
    const s = await sender("development");
    const warn = vi.spyOn((s as unknown as { logger: { warn: (m: string) => void } }).logger, "warn").mockImplementation(() => undefined);
    await s.send("a@b.co", "123456");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("123456"));
  });
});
