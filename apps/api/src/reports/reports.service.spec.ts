import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { ReportsService } from "./reports.service";

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    pipeline: { findFirst: vi.fn().mockResolvedValue(null) },
    stage: { findMany: vi.fn().mockResolvedValue([]) },
    lead: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    automationRun: { groupBy: vi.fn().mockResolvedValue([]) },
    runStep: { groupBy: vi.fn().mockResolvedValue([]) },
    membership: { findMany: vi.fn().mockResolvedValue([]) },
    slaTimer: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides
  };
}

function makeService(client: ReturnType<typeof makeClient>) {
  return new ReportsService({ client } as unknown as PrismaService);
}

describe("ReportsService.pipelineFunnel", () => {
  it("throws when the workspace has no pipeline at all", async () => {
    const client = makeClient();
    const service = makeService(client);

    await expect(service.pipelineFunnel("ws1")).rejects.toThrow(NotFoundException);
  });

  it("defaults to the workspace's default pipeline when no pipelineId is given", async () => {
    const client = makeClient({
      pipeline: { findFirst: vi.fn().mockResolvedValue({ id: "pipe1", name: "Sales" }) },
      stage: {
        findMany: vi.fn().mockResolvedValue([
          { id: "s1", name: "New", type: "open" },
          { id: "s2", name: "Won", type: "won" }
        ])
      },
      lead: { count: vi.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(2) }
    });
    const service = makeService(client);

    const result = await service.pipelineFunnel("ws1");

    expect(client.pipeline.findFirst).toHaveBeenCalledWith({ where: { workspaceId: "ws1" }, orderBy: { isDefault: "desc" } });
    expect(result).toEqual({
      pipelineId: "pipe1",
      pipelineName: "Sales",
      stages: [
        { stageId: "s1", name: "New", type: "open", count: 5 },
        { stageId: "s2", name: "Won", type: "won", count: 2 }
      ]
    });
  });

  it("looks up a specific pipeline when pipelineId is given", async () => {
    const client = makeClient({ pipeline: { findFirst: vi.fn().mockResolvedValue({ id: "pipe2", name: "Onboarding" }) } });
    const service = makeService(client);

    await service.pipelineFunnel("ws1", "pipe2");

    expect(client.pipeline.findFirst).toHaveBeenCalledWith({ where: { id: "pipe2", workspaceId: "ws1" } });
  });
});

describe("ReportsService.botDropoff", () => {
  it("scopes both groupBys to the workspace via the automation relation", async () => {
    const client = makeClient({
      automationRun: { groupBy: vi.fn().mockResolvedValue([{ status: "completed", _count: 12 }]) },
      runStep: { groupBy: vi.fn().mockResolvedValue([{ blockId: "b1", type: "send_text", status: "ok", _count: 8 }]) }
    });
    const service = makeService(client);

    const result = await service.botDropoff("ws1");

    expect(client.automationRun.groupBy).toHaveBeenCalledWith({
      by: ["status"],
      where: { automation: { workspaceId: "ws1" } },
      _count: true
    });
    expect(result).toEqual({
      runsByStatus: [{ status: "completed", count: 12 }],
      stepFunnel: [{ blockId: "b1", type: "send_text", status: "ok", count: 8 }]
    });
  });
});

describe("ReportsService.teamPerformance", () => {
  it("aggregates leads and response times per owner, defaulting to zero for reps with none", async () => {
    const client = makeClient({
      membership: {
        findMany: vi.fn().mockResolvedValue([
          { userId: "u1", role: "sales", user: { id: "u1", name: "Asha", email: "asha@x.com" } },
          { userId: "u2", role: "sales", user: { id: "u2", name: "Ravi", email: "ravi@x.com" } }
        ])
      },
      lead: {
        findMany: vi.fn().mockResolvedValue([
          { id: "l1", ownerId: "u1", stage: { type: "won" } },
          { id: "l2", ownerId: "u1", stage: { type: "open" } },
          { id: "l3", ownerId: "u1", stage: { type: "lost" } }
        ])
      },
      slaTimer: {
        findMany: vi.fn().mockResolvedValue([
          { leadId: "l1", createdAt: new Date("2026-01-01T00:00:00Z"), resolvedAt: new Date("2026-01-01T00:10:00Z") },
          { leadId: "l2", createdAt: new Date("2026-01-01T00:00:00Z"), resolvedAt: new Date("2026-01-01T00:20:00Z") }
        ])
      }
    });
    const service = makeService(client);

    const result = await service.teamPerformance("ws1");

    expect(result).toEqual([
      { userId: "u1", name: "Asha", email: "asha@x.com", role: "sales", totalLeads: 3, won: 1, lost: 1, avgResponseMinutes: 15 },
      { userId: "u2", name: "Ravi", email: "ravi@x.com", role: "sales", totalLeads: 0, won: 0, lost: 0, avgResponseMinutes: null }
    ]);
  });
});

describe("ReportsService.lostReasons", () => {
  it("groups by reason and defaults blank reasons to a catch-all bucket", async () => {
    const client = makeClient({
      lead: {
        groupBy: vi.fn().mockResolvedValue([
          { lostReason: "Too expensive", _count: { _all: 2 } },
          { lostReason: null, _count: { _all: 1 } },
          { lostReason: "  ", _count: { _all: 1 } }
        ])
      }
    });
    const service = makeService(client);

    const result = await service.lostReasons("ws1");

    expect(result).toEqual([
      { reason: "Too expensive", count: 2 },
      { reason: "No reason given", count: 2 }
    ]);
  });
});
