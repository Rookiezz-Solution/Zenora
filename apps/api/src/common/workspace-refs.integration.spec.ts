import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AutomationsService } from "../automations/automations.service";
import { InboxService } from "../inbox/inbox.service";
import type { PrismaService } from "../prisma/prisma.service";
import { RoutingRulesService } from "../routing/routing-rules.service";
import { TasksService } from "../tasks/tasks.service";

// Nobody in the workspace, no such lead, no such team: every referenced id is "foreign".
function foreignPrisma(extra: Record<string, unknown> = {}) {
  return {
    client: {
      membership: { findUnique: vi.fn().mockResolvedValue(null) },
      lead: { findFirst: vi.fn().mockResolvedValue(null) },
      team: { findFirst: vi.fn().mockResolvedValue(null) },
      task: { create: vi.fn(), updateMany: vi.fn() },
      conversation: { updateMany: vi.fn() },
      routingRule: { count: vi.fn().mockResolvedValue(0), create: vi.fn(), updateMany: vi.fn() },
      ...extra
    }
  } as unknown as PrismaService & { client: Record<string, Record<string, ReturnType<typeof vi.fn>>> };
}

describe("foreign ids in request bodies are rejected before anything is written", () => {
  it("task: a lead from another workspace (it would leak that lead's name and phone in the task list)", async () => {
    const prisma = foreignPrisma();
    await expect(new TasksService(prisma).create("ws1", { title: "Call", leadId: "other-workspace-lead" })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.client.task!.create).not.toHaveBeenCalled();
  });

  it("task: an assignee who is not in the workspace, on create and on update", async () => {
    const prisma = foreignPrisma();
    const service = new TasksService(prisma);
    await expect(service.create("ws1", { title: "Call", assignedToId: "stranger" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update("ws1", "t1", { assignedToId: "stranger" })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.client.task!.create).not.toHaveBeenCalled();
    expect(prisma.client.task!.updateMany).not.toHaveBeenCalled();
  });

  it("task: a lead and assignee that do belong to the workspace are accepted, and unassigning (null) is allowed", async () => {
    const prisma = foreignPrisma({
      membership: { findUnique: vi.fn().mockResolvedValue({ id: "m" }) },
      lead: { findFirst: vi.fn().mockResolvedValue({ id: "l1" }) },
      task: { create: vi.fn().mockResolvedValue({ id: "t1" }), updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "t1" }) }
    });
    const service = new TasksService(prisma);
    await service.create("ws1", { title: "Call", leadId: "l1", assignedToId: "u1" });
    await service.update("ws1", "t1", { assignedToId: null });
    expect(prisma.client.task!.create).toHaveBeenCalled();
  });

  it("conversation: assigning to someone outside the workspace", async () => {
    const prisma = foreignPrisma();
    const inbox = new InboxService(prisma, {} as never, {} as never, {} as never, {} as never);
    await expect(inbox.assign("ws1", "c1", { userId: "stranger" })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.client.conversation!.updateMany).not.toHaveBeenCalled();
  });

  it("routing rule: a user or team from another workspace, on create and on update", async () => {
    const prisma = foreignPrisma();
    const service = new RoutingRulesService(prisma);
    const conditions = [{ field: "source", operator: "equals", value: "whatsapp" }] as never;
    await expect(service.createRoutingRule("ws1", { conditions, assignTo: { type: "user", targetId: "stranger" } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createRoutingRule("ws1", { conditions, assignTo: { type: "team", targetId: "other-team" } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateRoutingRule("ws1", "r1", { assignTo: { type: "user", targetId: "stranger" } })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.client.routingRule!.create).not.toHaveBeenCalled();
    expect(prisma.client.routingRule!.updateMany).not.toHaveBeenCalled();
  });

  it("automation draft: an assign step naming someone outside the workspace", async () => {
    const prisma = foreignPrisma({ automation: { findFirst: vi.fn().mockResolvedValue({ id: "a1", versions: [] }) } });
    const service = new AutomationsService(prisma, {} as never, {} as never, {} as never);
    const graph = { startBlockId: "a", blocks: { a: { id: "a", type: "assign", userId: "stranger", next: null } } };
    await expect(service.saveDraft("ws1", "a1", { graph } as never)).rejects.toBeInstanceOf(BadRequestException);
  });
});
