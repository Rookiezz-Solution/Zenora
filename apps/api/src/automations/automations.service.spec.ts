import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { FlowGraph } from "@zenora/shared";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import { AutomationsService } from "./automations.service";

function makeAudit() {
  return { log: vi.fn() } as unknown as AuditService;
}

const VALID_GRAPH: FlowGraph = {
  startBlockId: "a",
  blocks: { a: { id: "a", type: "send_text", body: "Hi!", next: "b" }, b: { id: "b", type: "handover" } }
};

describe("AutomationsService.saveDraft", () => {
  it("updates the existing version in place while it's still a draft", async () => {
    const update = vi.fn();
    const create = vi.fn();
    const client = {
      automation: { findFirst: vi.fn().mockResolvedValue({ id: "auto1", workspaceId: "ws1", triggerId: null, versions: [{ id: "v1", version: 1, publishedAt: null, graph: {} }] }) },
      automationVersion: { update, create }
    };
    const prisma = { client } as unknown as PrismaService;
    const service = new AutomationsService(prisma, makeAudit());

    await service.saveDraft("ws1", "auto1", { graph: VALID_GRAPH });

    expect(update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { graph: VALID_GRAPH } });
    expect(create).not.toHaveBeenCalled();
  });

  it("starts a new version instead of mutating one that's already published", async () => {
    const update = vi.fn();
    const create = vi.fn();
    const client = {
      automation: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "auto1", workspaceId: "ws1", triggerId: null, versions: [{ id: "v1", version: 1, publishedAt: new Date(), graph: {} }] })
      },
      automationVersion: { update, create }
    };
    const prisma = { client } as unknown as PrismaService;
    const service = new AutomationsService(prisma, makeAudit());

    await service.saveDraft("ws1", "auto1", { graph: VALID_GRAPH });

    expect(create).toHaveBeenCalledWith({ data: { automationId: "auto1", version: 2, graph: VALID_GRAPH } });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("AutomationsService.publish", () => {
  function makeAutomation(overrides: Partial<{ triggerId: string | null; draft: { id: string; version: number; publishedAt: Date | null; graph: unknown } | null }> = {}) {
    return {
      id: "auto1",
      workspaceId: "ws1",
      triggerId: "trig1",
      versions: overrides.draft === null ? [] : [overrides.draft ?? { id: "v1", version: 1, publishedAt: null, graph: VALID_GRAPH }],
      ...overrides
    };
  }

  it("refuses to publish without a trigger", async () => {
    const client = {
      automation: { findFirst: vi.fn().mockResolvedValue(makeAutomation({ triggerId: null })) }
    };
    const prisma = { client } as unknown as PrismaService;
    const service = new AutomationsService(prisma, makeAudit());

    await expect(service.publish("ws1", "auto1", "user1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses to publish a graph with dangling references", async () => {
    const brokenGraph: FlowGraph = { startBlockId: "a", blocks: { a: { id: "a", type: "send_text", body: "hi", next: "nowhere" } } };
    const client = {
      automation: {
        findFirst: vi.fn().mockResolvedValue(makeAutomation({ draft: { id: "v1", version: 1, publishedAt: null, graph: brokenGraph } }))
      }
    };
    const prisma = { client } as unknown as PrismaService;
    const service = new AutomationsService(prisma, makeAudit());

    await expect(service.publish("ws1", "auto1", "user1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("marks the draft version published and the automation live", async () => {
    const versionUpdate = vi.fn();
    const automationUpdate = vi.fn();
    const automation = makeAutomation();
    const client = {
      automation: { findFirst: vi.fn().mockResolvedValue(automation), update: automationUpdate },
      automationVersion: { update: versionUpdate }
    };
    const prisma = { client } as unknown as PrismaService;
    const service = new AutomationsService(prisma, makeAudit());

    await service.publish("ws1", "auto1", "user1");

    expect(versionUpdate).toHaveBeenCalledWith({ where: { id: "v1" }, data: { publishedAt: expect.any(Date) } });
    expect(automationUpdate).toHaveBeenCalledWith({ where: { id: "auto1" }, data: { status: "live" } });
  });

  it("doesn't re-stamp publishedAt on a version that's already published", async () => {
    const versionUpdate = vi.fn();
    const automationUpdate = vi.fn();
    const automation = makeAutomation({ draft: { id: "v1", version: 1, publishedAt: new Date("2026-01-01"), graph: VALID_GRAPH } });
    const client = {
      automation: { findFirst: vi.fn().mockResolvedValue(automation), update: automationUpdate },
      automationVersion: { update: versionUpdate }
    };
    const prisma = { client } as unknown as PrismaService;
    const service = new AutomationsService(prisma, makeAudit());

    await service.publish("ws1", "auto1", "user1");

    expect(versionUpdate).not.toHaveBeenCalled();
    expect(automationUpdate).toHaveBeenCalledWith({ where: { id: "auto1" }, data: { status: "live" } });
  });
});

describe("AutomationsService.testRun", () => {
  it("walks the graph from the start block and logs the intended action at each step, without persisting a lead", async () => {
    const runStepCreate = vi.fn();
    const client = {
      automation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "auto1",
          workspaceId: "ws1",
          triggerId: "trig1",
          versions: [{ id: "v1", version: 1, publishedAt: new Date(), graph: VALID_GRAPH }]
        })
      },
      automationRun: {
        create: vi.fn().mockResolvedValue({ id: "run1" }),
        update: vi.fn()
      },
      runStep: { create: runStepCreate }
    };
    const prisma = { client } as unknown as PrismaService;
    const service = new AutomationsService(prisma, makeAudit());

    const result = await service.testRun("ws1", "auto1", "user1", { channel: "whatsapp", sampleMessage: "PRICE" });

    expect(client.automationRun.create).toHaveBeenCalledWith({ data: { automationId: "auto1", status: "running" } });
    expect(result.steps.map((s) => s.blockId)).toEqual(["a", "b"]);
    expect(result.steps[0]?.output).toMatchObject({ wouldSend: "Hi!", channel: "whatsapp" });
    expect(runStepCreate).toHaveBeenCalledTimes(2);
    expect(client.automationRun.update).toHaveBeenCalledWith({
      where: { id: "run1" },
      data: { status: "completed", completedAt: expect.any(Date) }
    });
  });

  it("stops after a handover block instead of looping", async () => {
    const client = {
      automation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "auto1",
          workspaceId: "ws1",
          triggerId: "trig1",
          versions: [{ id: "v1", version: 1, publishedAt: new Date(), graph: VALID_GRAPH }]
        })
      },
      automationRun: { create: vi.fn().mockResolvedValue({ id: "run1" }), update: vi.fn() },
      runStep: { create: vi.fn() }
    };
    const prisma = { client } as unknown as PrismaService;
    const service = new AutomationsService(prisma, makeAudit());

    const result = await service.testRun("ws1", "auto1", "user1", { channel: "instagram", sampleMessage: "hi" });

    expect(result.steps).toHaveLength(2);
    expect(result.steps[1]?.output).toEqual({ wouldHandOverToHuman: true });
  });
});
