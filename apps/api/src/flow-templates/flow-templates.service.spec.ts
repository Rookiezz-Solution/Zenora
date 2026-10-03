import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { FlowGraph } from "@zenora/shared";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import { FlowTemplatesService } from "./flow-templates.service";

function makeAudit() {
  return { log: vi.fn() } as unknown as AuditService;
}

const TEMPLATE_GRAPH: FlowGraph = {
  startBlockId: "a",
  blocks: { a: { id: "a", type: "send_text", body: "Welcome to {business_name}!", next: null } }
};

describe("FlowTemplatesService ownership", () => {
  it("refuses to update a public (system) template", async () => {
    const client = {
      flowTemplate: { findUnique: vi.fn().mockResolvedValue({ id: "t1", workspaceId: null, graph: TEMPLATE_GRAPH }) }
    };
    const prisma = { client } as unknown as PrismaService;
    const service = new FlowTemplatesService(prisma, makeAudit());

    await expect(service.update("ws1", "t1", "user1", { name: "Hacked" })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses to delete a template owned by a different workspace", async () => {
    const client = {
      flowTemplate: { findUnique: vi.fn().mockResolvedValue({ id: "t1", workspaceId: "ws_other", graph: TEMPLATE_GRAPH }) }
    };
    const prisma = { client } as unknown as PrismaService;
    const service = new FlowTemplatesService(prisma, makeAudit());

    await expect(service.remove("ws1", "t1", "user1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows updating a template the workspace owns", async () => {
    const update = vi.fn().mockResolvedValue({ id: "t1" });
    const client = {
      flowTemplate: { findUnique: vi.fn().mockResolvedValue({ id: "t1", workspaceId: "ws1", graph: TEMPLATE_GRAPH }), update }
    };
    const prisma = { client } as unknown as PrismaService;
    const service = new FlowTemplatesService(prisma, makeAudit());

    await service.update("ws1", "t1", "user1", { name: "Renamed" });

    expect(update).toHaveBeenCalled();
  });
});

describe("FlowTemplatesService.use", () => {
  it("creates a new automation from the template with the workspace name filled in", async () => {
    const automationCreate = vi.fn().mockResolvedValue({ id: "auto1" });
    const versionCreate = vi.fn();
    const client = {
      flowTemplate: { findFirst: vi.fn().mockResolvedValue({ id: "t1", workspaceId: null, graph: TEMPLATE_GRAPH }) },
      workspace: { findUnique: vi.fn().mockResolvedValue({ agencyId: null }), findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "ws1", name: "Acme Coaching" }) },
      automation: { create: automationCreate },
      automationVersion: { create: versionCreate }
    };
    const prisma = { client } as unknown as PrismaService;
    const service = new FlowTemplatesService(prisma, makeAudit());

    await service.use("ws1", "t1", "user1", { name: "My new automation" });

    expect(automationCreate).toHaveBeenCalledWith({ data: { workspaceId: "ws1", name: "My new automation" } });
    const versionArg = versionCreate.mock.calls[0][0];
    expect(versionArg.data.graph.blocks.a.body).toBe("Welcome to Acme Coaching!");
  });
});

// --- sharing, publishing and moderation -------------------------------------

function makeSharing(template: Record<string, unknown> | null, workspace: Record<string, unknown> = { agencyId: null }) {
  const update = vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...template, ...data }));
  const client = {
    flowTemplate: { findUnique: vi.fn().mockResolvedValue(template), findFirst: vi.fn().mockResolvedValue(template), findMany: vi.fn().mockResolvedValue(template ? [template] : []), update },
    workspace: { findUnique: vi.fn().mockResolvedValue(workspace) },
    platformAuditLog: { create: vi.fn() }
  };
  const audit = makeAudit();
  return { service: new FlowTemplatesService({ client } as unknown as PrismaService, audit), client, update, audit };
}

const owned = (extra: Record<string, unknown> = {}) => ({ id: "t1", workspaceId: "ws1", name: "Welcome", scope: "private", publishStatus: null, publishNote: null, graph: TEMPLATE_GRAPH, ...extra });

describe("FlowTemplatesService visibility", () => {
  it("only offers a workspace its own templates, Zenora's, approved public ones, and its agency's shared ones", async () => {
    const { service, client } = makeSharing(owned(), { agencyId: "ag1" });
    await service.list("ws1", { scope: "all" });
    const where = (client.flowTemplate.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where;
    expect(where.AND[0].OR).toEqual([
      { workspaceId: "ws1" },
      { workspaceId: null },
      { scope: "public", publishStatus: "approved" },
      { scope: "agency", workspace: { agencyId: "ag1" } }
    ]);
  });

  it("offers no agency templates to a workspace that has no agency", async () => {
    const { service, client } = makeSharing(owned());
    await service.list("ws1", { scope: "all" });
    const or = (client.flowTemplate.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where.AND[0].OR;
    expect(or.some((c: { scope?: string }) => c.scope === "agency")).toBe(false);
  });

  it("labels where a template came from but never reveals which workspace made someone else's", async () => {
    const { service } = makeSharing(owned({ workspaceId: "ws-other", scope: "public", publishStatus: "approved", publishNote: "internal note" }));
    const [t] = await service.list("ws1", { scope: "public" });
    expect(t).toMatchObject({ origin: "community", workspaceId: null, publishStatus: null, publishNote: null });
  });

  it("shows review state to the author only", async () => {
    const { service } = makeSharing(owned({ publishStatus: "rejected", publishNote: "too generic" }));
    const [t] = await service.list("ws1", { scope: "mine" });
    expect(t).toMatchObject({ origin: "mine", workspaceId: "ws1", publishStatus: "rejected", publishNote: "too generic" });
  });

  it("404s for a template the workspace may not see", async () => {
    const { service } = makeSharing(null);
    await expect(service.getById("ws1", "someone-elses-private")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("FlowTemplatesService sharing and publishing", () => {
  it("shares with the agency only when the workspace is managed by one", async () => {
    const solo = makeSharing(owned());
    await expect(solo.service.share("ws1", "t1", "u1", "agency")).rejects.toBeInstanceOf(BadRequestException);

    const managed = makeSharing(owned(), { agencyId: "ag1" });
    await managed.service.share("ws1", "t1", "u1", "agency");
    expect(managed.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { scope: "agency" } });
  });

  it("only the owning workspace can share, publish or withdraw", async () => {
    const { service } = makeSharing(owned({ workspaceId: "ws-other" }));
    await expect(service.share("ws1", "t1", "u1", "private")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.requestPublish("ws1", "t1", "u1")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.withdrawPublish("ws1", "t1", "u1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("puts a clean template in the review queue without making it public", async () => {
    const { service, update } = makeSharing(owned());
    await service.requestPublish("ws1", "t1", "u1");
    expect(update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { publishStatus: "pending", publishNote: null } });
  });

  it("refuses to publish a template containing a phone number or an email, naming the problem", async () => {
    const dirty = { startBlockId: "a", blocks: { a: { id: "a", type: "send_text", body: "Call me on 9876543210 or mail asha@example.com", next: null } } };
    const { service, update } = makeSharing(owned({ graph: dirty }));
    const error = await service.requestPublish("ws1", "t1", "u1").catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse().issues.map((i: { kind: string }) => i.kind).sort()).toEqual(["email", "phone"]);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses an empty template, and one already pending or public", async () => {
    await expect(makeSharing(owned({ graph: { startBlockId: "", blocks: {} } })).service.requestPublish("ws1", "t1", "u1")).rejects.toBeInstanceOf(BadRequestException);
    await expect(makeSharing(owned({ publishStatus: "pending" })).service.requestPublish("ws1", "t1", "u1")).rejects.toBeInstanceOf(ConflictException);
    await expect(makeSharing(owned({ scope: "public", publishStatus: "approved" })).service.requestPublish("ws1", "t1", "u1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("editing a published or pending template takes it back to private, so approved content cannot be swapped", async () => {
    for (const state of [{ scope: "public", publishStatus: "approved" }, { scope: "private", publishStatus: "pending" }]) {
      const { service, update } = makeSharing(owned(state));
      await service.update("ws1", "t1", "u1", { name: "Changed" });
      expect(update.mock.calls[0]![0].data).toMatchObject({ scope: "private", publishStatus: null, publishNote: null });
    }
  });

  it("withdrawing a public template makes it private again", async () => {
    const { service, update } = makeSharing(owned({ scope: "public", publishStatus: "approved" }));
    await service.withdrawPublish("ws1", "t1", "u1");
    expect(update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { publishStatus: null, publishNote: null, scope: "private" } });
  });
});

describe("FlowTemplatesService moderation", () => {
  it("approving makes it public, re-checks for personal data, and is audited", async () => {
    const { service, update, client } = makeSharing(owned({ publishStatus: "pending" }));
    await service.approve("admin1", "t1");
    expect(update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { scope: "public", publishStatus: "approved", publishNote: null } });
    expect((client.platformAuditLog.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data).toMatchObject({ userId: "admin1", action: "template.approved" });

    const dirty = { startBlockId: "a", blocks: { a: { id: "a", type: "send_text", body: "ring 9876543210", next: null } } };
    const bad = makeSharing(owned({ publishStatus: "pending", graph: dirty }));
    await expect(bad.service.approve("admin1", "t1")).rejects.toBeInstanceOf(BadRequestException);
    expect(bad.update).not.toHaveBeenCalled();
  });

  it("rejecting records the reason for the author, and only works on templates awaiting review", async () => {
    const { service, update } = makeSharing(owned({ publishStatus: "pending" }));
    await service.reject("admin1", "t1", "Too generic");
    expect(update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { publishStatus: "rejected", publishNote: "Too generic" } });

    await expect(makeSharing(owned()).service.approve("admin1", "t1")).rejects.toBeInstanceOf(ConflictException);
    await expect(makeSharing(null).service.reject("admin1", "t1", "x")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("shows reviewers the text of each pending template", async () => {
    const { service } = makeSharing(owned({ publishStatus: "pending" }));
    const [row] = await service.pendingReview();
    expect(row!.text).toContain("Welcome to {business_name}!");
  });
});
