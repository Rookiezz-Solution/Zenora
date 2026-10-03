import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://x";
  process.env.AUTH_SECRET = "a".repeat(32);
  process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  process.env.SUPER_ADMIN_EMAILS = " Owner@Example.com , second@example.com ";
  process.env.GOOGLE_CLIENT_SECRET = "";
  process.env.RAZORPAY_KEY_ID = "rzp_from_env";
});

// Deterministic stand-in for AES so tests can see what gets stored.
vi.mock("../common/encryption", () => ({
  encryptToken: (v: string) => `enc(${v})`,
  decryptToken: (v: string) => v.replace(/^enc\(|\)$/g, "")
}));

import { loadEnv, setRuntimeOverrides } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import { PlatformSettingsService } from "./platform-settings.service";
import { SuperAdminGuard, isSuperAdminEmail } from "./super-admin.guard";

function makeService(rows: { key: string; valueCipher: string }[] = []) {
  const client = {
    platformSetting: { findMany: vi.fn().mockResolvedValue(rows), upsert: vi.fn(), deleteMany: vi.fn() },
    platformAuditLog: { create: vi.fn() },
    workspace: { count: vi.fn().mockResolvedValue(3) },
    user: { count: vi.fn().mockResolvedValue(7) }
  };
  return { service: new PlatformSettingsService({ client } as unknown as PrismaService), client };
}

describe("PlatformSettingsService", () => {
  it("encrypts a value before storing it and records the change without the value", async () => {
    const { service, client } = makeService();
    await service.set("admin1", "ANTHROPIC_API_KEY", "  sk-live-123  ");

    expect(client.platformSetting.upsert.mock.calls[0]![0].create).toMatchObject({ key: "ANTHROPIC_API_KEY", valueCipher: "enc(sk-live-123)" });
    const audit = client.platformAuditLog.create.mock.calls[0]![0].data;
    expect(audit).toEqual({ userId: "admin1", action: "setting.set", key: "ANTHROPIC_API_KEY" });
    expect(JSON.stringify(audit)).not.toContain("sk-live-123");
  });

  it("rejects unknown keys, so platform secrets like AUTH_SECRET can't be written", async () => {
    const { service, client } = makeService();
    await expect(service.set("admin1", "AUTH_SECRET", "x")).rejects.toThrow("Unknown setting");
    await expect(service.set("admin1", "DATABASE_URL", "x")).rejects.toThrow("Unknown setting");
    expect(client.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it("rejects multi-line values", async () => {
    const { service } = makeService();
    await expect(service.set("admin1", "ANTHROPIC_API_KEY", "a\nb")).rejects.toThrow("single line");
  });

  it("treats an empty value as clearing the setting", async () => {
    const { service, client } = makeService();
    await service.set("admin1", "ANTHROPIC_API_KEY", "   ");
    expect(client.platformSetting.deleteMany).toHaveBeenCalledWith({ where: { key: "ANTHROPIC_API_KEY" } });
    expect(client.platformAuditLog.create.mock.calls[0]![0].data.action).toBe("setting.cleared");
  });

  it("applies stored values over the environment, so existing loadEnv() callers see them", async () => {
    const { service } = makeService([{ key: "RAZORPAY_KEY_ID", valueCipher: "enc(rzp_from_dashboard)" }]);
    expect(loadEnv().RAZORPAY_KEY_ID).toBe("rzp_from_env");
    await service.refresh();
    expect(loadEnv().RAZORPAY_KEY_ID).toBe("rzp_from_dashboard");
    setRuntimeOverrides({});
    expect(loadEnv().RAZORPAY_KEY_ID).toBe("rzp_from_env");
  });

  it("skips a value it can't decrypt instead of failing the whole refresh", async () => {
    const { service } = makeService([{ key: "RAZORPAY_KEY_ID", valueCipher: "enc(ok)" }]);
    await expect(service.refresh()).resolves.toBeUndefined();
    setRuntimeOverrides({});
  });

  it("NEVER returns a secret's value in the list — only whether it's set", async () => {
    const { service } = makeService([
      { key: "ANTHROPIC_API_KEY", valueCipher: "enc(sk-super-secret)" },
      { key: "META_APP_SECRET", valueCipher: "enc(meta-super-secret)" },
      { key: "GOOGLE_CLIENT_ID", valueCipher: "enc(google-client-id)" }
    ]);
    await service.refresh();

    const list = service.list();
    const serialized = JSON.stringify(list);
    expect(serialized).not.toContain("sk-super-secret");
    expect(serialized).not.toContain("meta-super-secret");

    const fields = list.flatMap((g) => g.fields);
    const apiKey = fields.find((f) => f.key === "ANTHROPIC_API_KEY")!;
    expect(apiKey).toMatchObject({ secret: true, configured: true, source: "dashboard", value: null });
    // Non-secret values may be shown so the admin can verify what they pasted.
    expect(fields.find((f) => f.key === "GOOGLE_CLIENT_ID")).toMatchObject({ secret: false, value: "google-client-id" });
    setRuntimeOverrides({});
  });

  it("reports group status and setup URLs", async () => {
    const { service } = makeService();
    await service.refresh();
    const groups = service.list();
    expect(groups.find((g) => g.id === "google")).toMatchObject({ status: "missing", restartRequired: true });
    expect(groups.find((g) => g.id === "google")!.setupLinks[0]!.url).toMatch(/\/calendar\/google\/callback$/);
    expect(groups.find((g) => g.id === "telephony")!.status).toBe("coming_soon");
  });

  it("exposes only non-secret ids through the public config", () => {
    const { service } = makeService();
    expect(Object.keys(service.publicConfig()).sort()).toEqual(["metaAppId", "metaWhatsappConfigId", "razorpayKeyId"]);
  });

  it("counts workspaces and users for the overview", async () => {
    const { service } = makeService();
    await expect(service.overview()).resolves.toEqual({ workspaces: 3, users: 7 });
  });
});

describe("super admin access", () => {
  it("matches the allowlist case-insensitively and ignores whitespace", () => {
    expect(isSuperAdminEmail("owner@example.com")).toBe(true);
    expect(isSuperAdminEmail("SECOND@example.com")).toBe(true);
  });

  it("denies everyone else, including missing emails", () => {
    expect(isSuperAdminEmail("intruder@example.com")).toBe(false);
    expect(isSuperAdminEmail("owner@example.com.evil.com")).toBe(false);
    expect(isSuperAdminEmail(null)).toBe(false);
  });

  it("the guard rejects non-admins and anonymous requests, and allows listed users", async () => {
    const ctx = (userId?: string) => ({ switchToHttp: () => ({ getRequest: () => ({ userId }) }) }) as unknown as ExecutionContext;
    const guard = (email: string | null) =>
      new SuperAdminGuard({ client: { user: { findUnique: vi.fn().mockResolvedValue(email ? { email } : null) } } } as unknown as PrismaService);

    await expect(guard("owner@example.com").canActivate(ctx("u1"))).resolves.toBe(true);
    await expect(guard("someone@else.com").canActivate(ctx("u1"))).rejects.toThrow(ForbiddenException);
    await expect(guard(null).canActivate(ctx(undefined))).rejects.toThrow(ForbiddenException);
  });
});
