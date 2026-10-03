import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctx = { switchToHttp: () => ({ getRequest: () => ({ headers: {}, rawBody: Buffer.from("{}") }) }) } as unknown as ExecutionContext;

async function guardWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const { MetaSignatureGuard } = await import("./meta-signature.guard");
  return new MetaSignatureGuard();
}

describe("MetaSignatureGuard with no META_APP_SECRET", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
    process.env.TOKEN_ENCRYPTION_KEY = "a1".repeat(32);
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("refuses every webhook in production instead of accepting unsigned events", async () => {
    const guard = await guardWith({ META_APP_SECRET: undefined, NODE_ENV: "production" });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("still lets local development through before a Meta app exists", async () => {
    const guard = await guardWith({ META_APP_SECRET: undefined, NODE_ENV: "development" });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
