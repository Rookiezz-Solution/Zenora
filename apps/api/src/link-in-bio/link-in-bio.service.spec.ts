import type { WebhooksService } from "../developers/webhooks.service";
import { ConflictException, HttpException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { RoutingEngineService } from "../routing/routing-engine.service";
import { LinkInBioService } from "./link-in-bio.service";

const PAGE = { workspaceId: "ws1", slug: "asha", title: "Asha", published: true };

function make(overrides: Record<string, unknown> = {}) {
  const client = {
    linkInBioPage: { findUnique: vi.fn().mockResolvedValue(PAGE), upsert: vi.fn().mockResolvedValue(PAGE) },
    lead: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "lead1" }) },
    consent: { create: vi.fn() },
    ...overrides
  };
  const routing = { applyToNewLead: vi.fn() };
  const webhooks = { emitLeadCreated: vi.fn().mockResolvedValue(undefined) };
  const service = new LinkInBioService({ client } as unknown as PrismaService, routing as unknown as RoutingEngineService, webhooks as unknown as WebhooksService);
  return { service, client, routing, webhooks };
}

const input = { name: "Ravi", phone: "+91 98765 43210", consent: true as const };

describe("LinkInBioService.getPublic", () => {
  it("hides unpublished or missing pages", async () => {
    const { service } = make({ linkInBioPage: { findUnique: vi.fn().mockResolvedValue({ ...PAGE, published: false }) } });
    await expect(service.getPublic("asha")).rejects.toThrow(NotFoundException);
  });

  it("never exposes the workspace id and includes the consent text", async () => {
    const { service } = make();
    const page = await service.getPublic("asha");
    expect(page).not.toHaveProperty("workspaceId");
    expect(page.consentText).toMatch(/contacted/);
  });
});

describe("LinkInBioService.submitCallback", () => {
  it("creates a lead with a recorded consent and routes it", async () => {
    const { service, client, routing, webhooks } = make();
    await service.submitCallback("asha", "1.1.1.1", input);
    expect(webhooks.emitLeadCreated).toHaveBeenCalledWith("ws1", "lead1");

    const data = client.lead.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ workspaceId: "ws1", phone: "919876543210", source: "link_in_bio" });
    expect(data.consents.create).toMatchObject({ type: "data_processing", granted: true });
    expect(data.consents.create.source).toContain("I agree to be contacted");
    expect(routing.applyToNewLead).toHaveBeenCalledWith("ws1", "lead1");
  });

  it("adds a consent to an existing lead instead of duplicating it, with the same response", async () => {
    const { service, client, webhooks } = make({ lead: { findFirst: vi.fn().mockResolvedValue({ id: "old" }), create: vi.fn() } });
    const result = await service.submitCallback("asha", "1.1.1.1", input);

    expect(result).toEqual({ ok: true });
    expect(client.lead.create).not.toHaveBeenCalled();
    expect(client.consent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ leadId: "old" }) });
    expect(webhooks.emitLeadCreated).not.toHaveBeenCalled();
  });

  it("rejects an invalid phone number", async () => {
    const { service } = make();
    await expect(service.submitCallback("asha", "1.1.1.1", { ...input, phone: "abc" })).rejects.toThrow("valid phone");
  });

  it("rate-limits repeated submissions from one ip", async () => {
    const { service } = make();
    for (let i = 0; i < 5; i++) await service.submitCallback("asha", "9.9.9.9", input);
    await expect(service.submitCallback("asha", "9.9.9.9", input)).rejects.toThrow(HttpException);
    await expect(service.submitCallback("asha", "8.8.8.8", input)).resolves.toEqual({ ok: true });
  });
});

describe("LinkInBioService.upsert", () => {
  const dto = { slug: "asha", title: "Asha", published: true };

  it("refuses an address another workspace owns", async () => {
    const { service } = make({ linkInBioPage: { findUnique: vi.fn().mockResolvedValue({ ...PAGE, workspaceId: "other" }), upsert: vi.fn() } });
    await expect(service.upsert("ws1", dto)).rejects.toThrow(ConflictException);
  });

  it("normalises the WhatsApp number and rejects a bad one", async () => {
    const { service, client } = make({ linkInBioPage: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() } });
    await service.upsert("ws1", { ...dto, whatsappPhone: "+91 98765 43210" });
    expect(client.linkInBioPage.upsert.mock.calls[0]![0].create.whatsappPhone).toBe("919876543210");
    await expect(service.upsert("ws1", { ...dto, whatsappPhone: "12" })).rejects.toThrow("8-15 digits");
  });
});
