import * as crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import { AudiencesService } from "./audiences.service";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const consent = (leadId: string, granted: boolean, createdAt: string) => ({ leadId, type: "marketing", granted, createdAt: new Date(createdAt) });

function make(opts: { leads?: { id: string; phone: string | null }[]; consents?: ReturnType<typeof consent>[]; timezone?: string } = {}) {
  const client = {
    workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ timezone: opts.timezone ?? "Asia/Kolkata" }) },
    lead: { findMany: vi.fn().mockResolvedValue(opts.leads ?? []) },
    consent: { findMany: vi.fn().mockResolvedValue(opts.consents ?? []) }
  };
  const audit = { log: vi.fn() };
  return { service: new AudiencesService({ client } as unknown as PrismaService, audit as unknown as AuditService), client, audit };
}

const people = [
  { id: "l1", phone: "9876543210" },
  { id: "l2", phone: "919811111111" },
  { id: "l3", phone: "9822222222" },
  { id: "l4", phone: null },
  { id: "l5", phone: "9833333333" }
];
const consents = [
  consent("l1", true, "2026-03-01"), // agreed
  consent("l2", true, "2026-03-01"), // agreed, then withdrew
  consent("l2", false, "2026-05-01"),
  // l3: never agreed
  consent("l5", true, "2026-03-01") // agreed
];

describe("AudiencesService.preview", () => {
  it("counts everyone with a phone, those who actively agreed to marketing, and what is uploadable", async () => {
    const { service } = make({ leads: people.filter((p) => p.phone), consents });
    expect(await service.preview("ws1", {})).toEqual({ contacts: 4, withMarketingConsent: 2, uploadable: 2 });
  });
});

describe("AudiencesService.exportForMeta", () => {
  it("includes only people with active marketing consent, as hashed digits-with-country-code", async () => {
    const { service } = make({ leads: people.filter((p) => p.phone), consents });
    const { csv, count } = await service.exportForMeta("ws1", "u1", {});

    expect(count).toBe(2);
    expect(csv.split("\n")).toEqual(["phone", sha("919876543210"), sha("919833333333"), ""]);
    expect(csv).not.toContain("9876543210"); // never a readable number
  });

  it("leaves out someone who withdrew consent, and someone who never gave it", async () => {
    const { service } = make({ leads: people.filter((p) => p.phone), consents });
    const { csv } = await service.exportForMeta("ws1", "u1", {});
    expect(csv).not.toContain(sha("919811111111")); // withdrew
    expect(csv).not.toContain(sha("919822222222")); // never agreed
  });

  it("lists each number once even if two leads share it", async () => {
    const { service } = make({ leads: [{ id: "a", phone: "9876543210" }, { id: "b", phone: "919876543210" }], consents: [consent("a", true, "2026-01-01"), consent("b", true, "2026-01-01")] });
    expect((await service.exportForMeta("ws1", "u1", {})).count).toBe(1);
  });

  it("does not guess a country code for workspaces outside India", async () => {
    const { service } = make({ timezone: "Europe/London", leads: [{ id: "a", phone: "9876543210" }], consents: [consent("a", true, "2026-01-01")] });
    expect((await service.exportForMeta("ws1", "u1", {})).csv).toContain(sha("9876543210"));
  });

  it("scopes the query to the workspace and the optional tag", async () => {
    const { service, client } = make({ leads: [], consents: [] });
    await service.exportForMeta("ws1", "u1", { tag: "vip" });
    expect(client.lead.findMany.mock.calls[0]![0].where).toMatchObject({ workspaceId: "ws1", mergedIntoId: null, tags: { some: { tag: { name: "vip", workspaceId: "ws1" } } } });
  });

  it("audits who exported how many, and never the numbers or hashes", async () => {
    const { service, audit } = make({ leads: people.filter((p) => p.phone), consents });
    await service.exportForMeta("ws1", "u1", { tag: "vip" });

    const entry = audit.log.mock.calls[0]![0];
    expect(entry).toMatchObject({ workspaceId: "ws1", userId: "u1", action: "audience.exported", metadata: { destination: "meta_customer_list", count: 2, tag: "vip" } });
    expect(JSON.stringify(entry)).not.toContain(sha("919876543210"));
    expect(JSON.stringify(entry)).not.toContain("9876543210");
  });

  it("exports just the header when nobody has consented", async () => {
    const { service } = make({ leads: people.filter((p) => p.phone), consents: [] });
    const { csv, count } = await service.exportForMeta("ws1", "u1", {});
    expect(count).toBe(0);
    expect(csv).toBe("phone\n");
  });
});
