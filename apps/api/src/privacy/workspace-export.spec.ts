import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import { WorkspaceExportService } from "./workspace-export.service";

function fakeRes() {
  const chunks: string[] = [];
  return { chunks, headers: {} as Record<string, string>, ended: false, destroyed: false, setHeader(k: string, v: string) { this.headers[k] = v; }, write(s: string) { chunks.push(s); return true; }, end() { this.ended = true; }, destroy() { this.destroyed = true; } };
}

function makeClient(overrides: Record<string, unknown> = {}) {
  const empty = () => ({ findMany: vi.fn().mockResolvedValue([]) });
  return {
    workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "ws1", name: "Asha Clinic", billingName: "Asha Clinic Pvt Ltd" }) },
    membership: empty(), pipeline: empty(), tag: empty(), customField: empty(), lead: empty(), conversation: empty(), task: empty(), appointment: empty(),
    automation: empty(), sequence: empty(), waTemplate: empty(), broadcast: empty(), flowTemplate: empty(), knowledgeSource: empty(), faq: empty(), invoice: empty(),
    ...overrides
  };
}

function make(client: ReturnType<typeof makeClient>) {
  const audit = { log: vi.fn() };
  return { service: new WorkspaceExportService({ client } as unknown as PrismaService, audit as unknown as AuditService), audit };
}

describe("WorkspaceExportService", () => {
  it("writes one valid JSON document, as a no-store download", async () => {
    const client = makeClient({ lead: { findMany: vi.fn().mockResolvedValue([{ id: "l1", name: "Asha", tags: [{ tag: { name: "vip" } }], fieldValues: [{ value: "Pune", field: { label: "City" } }], identities: [], notes: [], consents: [] }]) } });
    const res = fakeRes();
    await make(client).service.stream("ws1", "u1", res as never);

    const doc = JSON.parse(res.chunks.join(""));
    expect(doc.workspace.name).toBe("Asha Clinic");
    expect(doc.leads).toEqual([{ id: "l1", name: "Asha", identities: [], notes: [], consents: [], tags: ["vip"], customFields: [{ field: "City", value: "Pune" }] }]);
    expect(Object.keys(doc)).toEqual(expect.arrayContaining(["members", "pipelines", "leads", "conversations", "tasks", "appointments", "automations", "invoices", "knowledgeSources", "faqs"]));
    expect(res.headers["Content-Disposition"]).toContain("attachment");
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(res.ended).toBe(true);
  });

  it("reads big tables a page at a time, following the cursor until a short page", async () => {
    const full = Array.from({ length: 500 }, (_, i) => ({ id: `t${i}`, title: "x", tags: [], fieldValues: [] }));
    const findMany = vi.fn().mockResolvedValueOnce(full).mockResolvedValueOnce([{ id: "t-last", title: "y" }]);
    const res = fakeRes();
    await make(makeClient({ task: { findMany } })).service.stream("ws1", "u1", res as never);

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0]![0]).toMatchObject({ take: 500 });
    expect(findMany.mock.calls[1]![0]).toMatchObject({ cursor: { id: "t499" }, skip: 1 });
    expect(JSON.parse(res.chunks.join("")).tasks).toHaveLength(501);
  });

  it("scopes every table to the workspace", async () => {
    const client = makeClient();
    await make(client).service.stream("ws1", "u1", fakeRes() as never);
    for (const table of ["membership", "pipeline", "tag", "lead", "conversation", "task", "appointment", "automation", "invoice"] as const) {
      expect((client[table].findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where, table).toMatchObject({ workspaceId: "ws1" });
    }
  });

  it("never selects secrets: only a member's name and email, and no token or key columns", async () => {
    const client = makeClient();
    const res = fakeRes();
    await make(client).service.stream("ws1", "u1", res as never);

    expect((client.membership.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].select.user).toEqual({ select: { name: true, email: true } });
    const text = res.chunks.join("");
    for (const secret of ["accessTokenCipher", "refreshTokenCipher", "secretCipher", "keyHash", "passwordHash"]) expect(text).not.toContain(secret);
    // No delegate for those tables is even touched.
    expect(Object.keys(client)).not.toEqual(expect.arrayContaining(["apiKey", "webhookEndpoint", "whatsappNumber", "instagramAccount", "adAccount", "calendarAccount"]));
  });

  it("audits what was exported by count, without the contents", async () => {
    const client = makeClient({ task: { findMany: vi.fn().mockResolvedValue([{ id: "t1", title: "Secret plan" }]) } });
    const { service, audit } = make(client);
    await service.stream("ws1", "u1", fakeRes() as never);

    const entry = audit.log.mock.calls[0]![0];
    expect(entry).toMatchObject({ action: "privacy.workspace_exported", metadata: expect.objectContaining({ tasks: 1, leads: 0 }) });
    expect(JSON.stringify(entry)).not.toContain("Secret plan");
  });

  it("allows one export per workspace every ten minutes", async () => {
    const { service } = make(makeClient());
    await service.stream("ws-limited", "u1", fakeRes() as never);
    await expect(service.stream("ws-limited", "u1", fakeRes() as never)).rejects.toBeInstanceOf(HttpException);
  });

  it("aborts the connection instead of finishing a truncated file when a read fails part-way", async () => {
    const client = makeClient({ conversation: { findMany: vi.fn().mockRejectedValue(new Error("db down")) } });
    const res = fakeRes();
    const { service, audit } = make(client);
    await service.stream("ws-failing", "u1", res as never);

    expect(res.destroyed).toBe(true);
    expect(res.ended).toBe(false);
    expect(audit.log).not.toHaveBeenCalled();
  });
});
