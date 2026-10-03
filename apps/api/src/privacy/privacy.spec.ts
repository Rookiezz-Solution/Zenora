import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import { PrivacyService } from "./privacy.service";

const lead = {
  id: "l1",
  phone: "919000000001",
  email: "asha@example.com",
  identities: [{ value: "919000000001" }, { value: "ig_12345678" }],
  mergedFrom: [{ id: "dup1", phone: "919000000099", email: null, identities: [] }]
};

function make(client: Record<string, unknown> = {}) {
  const tx = {
    conversation: { findMany: vi.fn().mockResolvedValue([{ id: "c1" }, { id: "c2" }]), deleteMany: vi.fn() },
    message: { deleteMany: vi.fn().mockResolvedValue({ count: 14 }) },
    automationRun: { deleteMany: vi.fn() },
    task: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    slaTimer: { deleteMany: vi.fn() },
    appointment: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    webhookDelivery: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
    $executeRaw: vi.fn().mockResolvedValue(2),
    lead: { deleteMany: vi.fn(), delete: vi.fn() }
  };
  const full = {
    lead: { findFirst: vi.fn().mockResolvedValue(lead) },
    appointment: { findMany: vi.fn().mockResolvedValue([]) },
    workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ messageRetentionDays: null }), update: vi.fn() },
    $transaction: vi.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
    ...client
  };
  const audit = { log: vi.fn() };
  return { service: new PrivacyService({ client: full } as unknown as PrismaService, audit as unknown as AuditService), client: full, tx, audit };
}

describe("PrivacyService.exportLead", () => {
  it("404s for a lead outside the workspace", async () => {
    const { service } = make({ lead: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(service.exportLead("ws1", "x", "u1")).rejects.toThrow(NotFoundException);
  });

  it("returns the person's record, scoped to the workspace, and audits the export", async () => {
    const { service, client, audit } = make({
      lead: {
        findFirst: vi.fn().mockResolvedValue({
          id: "l1", name: "Asha", phone: "919000000001", email: null, source: "whatsapp", createdAt: new Date(), adReferral: null,
          identities: [{ type: "wa_phone", value: "919000000001" }], tags: [{ tag: { name: "vip" } }], notes: [{ body: "called", createdAt: new Date() }],
          consents: [], fieldValues: [{ field: { label: "City" }, value: "Pune" }], tasks: [],
          conversations: [{ channel: "whatsapp", createdAt: new Date(), messages: [{ direction: "inbound", type: "text", body: "hi", mediaUrl: null, createdAt: new Date() }] }]
        })
      }
    });
    const out = await service.exportLead("ws1", "l1", "u1");

    expect((client.lead.findFirst as ReturnType<typeof vi.fn>).mock.calls[0]![0].where).toEqual({ id: "l1", workspaceId: "ws1" });
    expect(out).toMatchObject({ lead: { name: "Asha" }, tags: ["vip"], customFields: [{ field: "City", value: "Pune" }] });
    expect(out.conversations[0]!.messages).toHaveLength(1);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "privacy.lead_exported", entityId: "l1" }));
  });
});

describe("PrivacyService.eraseLead", () => {
  it("404s for a lead outside the workspace, deleting nothing", async () => {
    const { service, tx } = make({ lead: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(service.eraseLead("ws1", "x", "u1")).rejects.toThrow(NotFoundException);
    expect(tx.lead.delete).not.toHaveBeenCalled();
  });

  it("removes conversations, messages, tasks, appointments, delivery logs and raw events, then the lead and its merged duplicates", async () => {
    const { service, tx } = make();
    const counts = await service.eraseLead("ws1", "l1", "u1");

    expect(tx.message.deleteMany).toHaveBeenCalledWith({ where: { conversationId: { in: ["c1", "c2"] } } });
    expect(tx.conversation.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["c1", "c2"] } } });
    expect(tx.task.deleteMany).toHaveBeenCalledWith({ where: { workspaceId: "ws1", leadId: { in: ["l1", "dup1"] } } });
    expect(tx.appointment.deleteMany).toHaveBeenCalledWith({ where: { workspaceId: "ws1", leadId: { in: ["l1", "dup1"] } } });
    expect(tx.lead.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["dup1"] } } });
    expect(tx.lead.delete).toHaveBeenCalledWith({ where: { id: "l1" } });
    expect(counts).toEqual({ leads: 2, conversations: 2, messages: 14, tasks: 2, appointments: 1, webhookDeliveries: 3, rawEvents: expect.any(Number) });
  });

  it("matches delivery logs by lead id for every event shape, scoped to the workspace", async () => {
    const { service, tx } = make();
    await service.eraseLead("ws1", "l1", "u1");
    const where = tx.webhookDelivery.deleteMany.mock.calls[0]![0].where;
    expect(where.workspaceId).toBe("ws1");
    expect(where.OR).toContainEqual({ payload: { path: ["data", "id"], equals: "l1" } });
    expect(where.OR).toContainEqual({ payload: { path: ["data", "leadId"], equals: "dup1" } });
  });

  it("clears raw events for every distinct identifying value in a single statement", async () => {
    const { service, tx } = make();
    await service.eraseLead("ws1", "l1", "u1");
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1); // phone, email, ig handle and the duplicate's phone together
  });

  it("is atomic: a failure part-way propagates and nothing is audited as erased", async () => {
    const { service, tx, audit } = make();
    tx.task.deleteMany.mockRejectedValue(new Error("boom"));
    await expect(service.eraseLead("ws1", "l1", "u1")).rejects.toThrow("boom");
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("audits with counts only, never the person's details", async () => {
    const { service, audit } = make();
    await service.eraseLead("ws1", "l1", "u1");
    const entry = audit.log.mock.calls[0]![0];
    expect(entry).toMatchObject({ action: "privacy.lead_erased", entityId: "l1" });
    expect(JSON.stringify(entry)).not.toContain("919000000001");
    expect(JSON.stringify(entry)).not.toContain("asha@example.com");
  });
});

describe("PrivacyService retention", () => {
  it("accepts the offered periods and null, and rejects anything else", async () => {
    const { service, client } = make();
    await expect(service.setRetention("ws1", "u1", 365)).resolves.toEqual({ messageRetentionDays: 365 });
    await expect(service.setRetention("ws1", "u1", null)).resolves.toEqual({ messageRetentionDays: null });
    await expect(service.setRetention("ws1", "u1", 5)).rejects.toThrow(BadRequestException);
    expect(client.workspace.update).toHaveBeenCalledTimes(2);
  });
});
