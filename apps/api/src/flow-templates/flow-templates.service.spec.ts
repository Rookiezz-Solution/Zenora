import { ForbiddenException } from "@nestjs/common";
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
      workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "ws1", name: "Acme Coaching" }) },
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
