import { describe, expect, it } from "vitest";
import { WEBHOOK_MAX_ATTEMPTS, checkWebhookUrl, isPrivateAddress, leadWebhookData } from "./developers";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "0.0.0.0",
    "100.64.0.1",
    "224.0.0.1",
    "localhost",
    "LOCALHOST",
    "foo.localhost",
    "db.internal",
    "printer.local",
    "redis",
    "::1",
    "[::1]",
    "fe80::1",
    "fd00::1",
    "::ffff:10.0.0.1",
    "::ffff:7f00:1", // ::ffff:127.0.0.1 in hex form
    "::"
  ])("treats %s as private", (host) => {
    expect(isPrivateAddress(host)).toBe(true);
  });

  it.each(["8.8.8.8", "172.32.0.1", "172.15.0.1", "1.1.1.1", "example.com", "hooks.zapier.com", "2606:4700:4700::1111"])("treats %s as public", (host) => {
    expect(isPrivateAddress(host)).toBe(false);
  });
});

describe("checkWebhookUrl", () => {
  it("accepts a public https URL", () => {
    expect(checkWebhookUrl("https://hooks.example.com/zenora")).toEqual({ ok: true, url: "https://hooks.example.com/zenora" });
  });

  it("refuses plain http, private hosts, junk and embedded credentials", () => {
    expect(checkWebhookUrl("http://example.com/x").ok).toBe(false);
    expect(checkWebhookUrl("https://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(checkWebhookUrl("https://localhost:3000/hook").ok).toBe(false);
    expect(checkWebhookUrl("https://[::1]/hook").ok).toBe(false);
    expect(checkWebhookUrl("not a url").ok).toBe(false);
    expect(checkWebhookUrl("ftp://example.com/x").ok).toBe(false);
    expect(checkWebhookUrl("https://user:pw@example.com/x").ok).toBe(false);
  });

  it("allows private http(s) targets only when explicitly enabled (local development)", () => {
    expect(checkWebhookUrl("http://localhost:9999/hook", { allowPrivate: true }).ok).toBe(true);
    expect(checkWebhookUrl("ftp://localhost/hook", { allowPrivate: true }).ok).toBe(false);
  });
});

describe("leadWebhookData", () => {
  it("exposes a small stable subset, not the whole row", () => {
    const data = leadWebhookData({ id: "l1", name: "Asha", phone: "919000000001", email: null, source: "api", stageId: null, createdAt: new Date("2026-10-05T00:00:00Z") });
    expect(data).toEqual({ id: "l1", name: "Asha", phone: "919000000001", email: null, source: "api", stageId: null, createdAt: "2026-10-05T00:00:00.000Z" });
  });
});

describe("retry budget", () => {
  it("makes six attempts in total", () => {
    expect(WEBHOOK_MAX_ATTEMPTS).toBe(6);
  });
});
