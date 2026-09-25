import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { MetaGraphClient } from "../channels/meta-graph.client";
import type { PrismaService } from "../prisma/prisma.service";

vi.mock("../common/encryption", () => ({ decryptToken: () => "plaintext" }));

import { TemplatesService } from "./templates.service";

function makeAudit() {
  return { log: vi.fn() } as unknown as AuditService;
}

const DRAFT_TEMPLATE = {
  id: "t1",
  workspaceId: "ws1",
  name: "welcome",
  category: "utility",
  language: "en",
  headerType: "none",
  headerText: null,
  bodyText: "Hi!",
  footerText: null,
  buttons: [],
  metaStatus: "pending",
  metaTemplateId: null,
  rejectionReason: null,
  submittedAt: null
};

describe("TemplatesService.create", () => {
  it("refuses to create a second template with the same name and language", async () => {
    const client = { waTemplate: { findFirst: vi.fn().mockResolvedValue(DRAFT_TEMPLATE) } };
    const prisma = { client } as unknown as PrismaService;
    const service = new TemplatesService(prisma, makeAudit(), {} as MetaGraphClient);

    await expect(
      service.create("ws1", "user1", { name: "welcome", category: "utility", language: "en", headerType: "none", bodyText: "Hi", buttons: [] })
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("TemplatesService editing after submission", () => {
  it("refuses to update a template that's already been submitted to Meta", async () => {
    const submitted = { ...DRAFT_TEMPLATE, submittedAt: new Date() };
    const client = { waTemplate: { findFirst: vi.fn().mockResolvedValue(submitted) } };
    const prisma = { client } as unknown as PrismaService;
    const service = new TemplatesService(prisma, makeAudit(), {} as MetaGraphClient);

    await expect(service.update("ws1", "t1", "user1", { bodyText: "Changed" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses to delete a template that's already been submitted to Meta", async () => {
    const submitted = { ...DRAFT_TEMPLATE, submittedAt: new Date() };
    const client = { waTemplate: { findFirst: vi.fn().mockResolvedValue(submitted) } };
    const prisma = { client } as unknown as PrismaService;
    const service = new TemplatesService(prisma, makeAudit(), {} as MetaGraphClient);

    await expect(service.remove("ws1", "t1", "user1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows updating a draft template that hasn't been submitted yet", async () => {
    const update = vi.fn().mockResolvedValue({ ...DRAFT_TEMPLATE, bodyText: "Changed" });
    const client = { waTemplate: { findFirst: vi.fn().mockResolvedValue(DRAFT_TEMPLATE), update } };
    const prisma = { client } as unknown as PrismaService;
    const service = new TemplatesService(prisma, makeAudit(), {} as MetaGraphClient);

    await service.update("ws1", "t1", "user1", { bodyText: "Changed" });

    expect(update).toHaveBeenCalled();
  });
});

describe("TemplatesService.submit", () => {
  it("stores the returned Meta template id, lowercased status, and submittedAt", async () => {
    const update = vi.fn().mockResolvedValue({ ...DRAFT_TEMPLATE, metaStatus: "pending" });
    const client = {
      waTemplate: { findFirst: vi.fn().mockResolvedValue(DRAFT_TEMPLATE), update },
      whatsappNumber: { findFirst: vi.fn().mockResolvedValue({ wabaId: "waba_1", accessTokenCipher: "cipher" }) }
    };
    const prisma = { client } as unknown as PrismaService;
    const meta = {
      submitWhatsappTemplate: vi.fn().mockResolvedValue({ metaTemplateId: "meta_123", status: "PENDING" })
    } as unknown as MetaGraphClient;
    const service = new TemplatesService(prisma, makeAudit(), meta);

    await service.submit("ws1", "t1", "user1");

    expect(update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { metaTemplateId: "meta_123", metaStatus: "pending", submittedAt: expect.any(Date) }
    });
  });

  it("refuses to submit a template a second time", async () => {
    const submitted = { ...DRAFT_TEMPLATE, submittedAt: new Date() };
    const client = { waTemplate: { findFirst: vi.fn().mockResolvedValue(submitted) } };
    const prisma = { client } as unknown as PrismaService;
    const service = new TemplatesService(prisma, makeAudit(), {} as MetaGraphClient);

    await expect(service.submit("ws1", "t1", "user1")).rejects.toBeInstanceOf(ConflictException);
  });
});
