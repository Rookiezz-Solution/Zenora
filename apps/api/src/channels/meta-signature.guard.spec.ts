import * as crypto from "node:crypto";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { beforeAll, describe, expect, it } from "vitest";

const APP_SECRET = "test-meta-app-secret";

beforeAll(() => {
  process.env.META_APP_SECRET = APP_SECRET;
  process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
  process.env.TOKEN_ENCRYPTION_KEY = "a1".repeat(32);
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

function makeContext(headers: Record<string, string>, rawBody?: Buffer): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, rawBody })
    })
  } as unknown as ExecutionContext;
}

function sign(body: Buffer): string {
  return "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(body).digest("hex");
}

describe("MetaSignatureGuard", () => {
  it("accepts a request with a valid signature", async () => {
    const { MetaSignatureGuard } = await import("./meta-signature.guard");
    const guard = new MetaSignatureGuard();
    const body = Buffer.from(JSON.stringify({ object: "instagram" }));

    expect(guard.canActivate(makeContext({ "x-hub-signature-256": sign(body) }, body))).toBe(true);
  });

  it("rejects a request with a tampered body", async () => {
    const { MetaSignatureGuard } = await import("./meta-signature.guard");
    const guard = new MetaSignatureGuard();
    const body = Buffer.from(JSON.stringify({ object: "instagram" }));
    const tamperedBody = Buffer.from(JSON.stringify({ object: "whatsapp_business_account" }));

    expect(() => guard.canActivate(makeContext({ "x-hub-signature-256": sign(body) }, tamperedBody))).toThrow(
      ForbiddenException
    );
  });

  it("rejects a request with no signature header", async () => {
    const { MetaSignatureGuard } = await import("./meta-signature.guard");
    const guard = new MetaSignatureGuard();
    const body = Buffer.from(JSON.stringify({ object: "instagram" }));

    expect(() => guard.canActivate(makeContext({}, body))).toThrow(ForbiddenException);
  });
});
