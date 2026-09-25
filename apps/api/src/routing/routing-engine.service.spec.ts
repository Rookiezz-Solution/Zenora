import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { QueueService } from "../queue/queue.service";
import { RoutingEngineService } from "./routing-engine.service";

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    lead: {
      findUnique: vi.fn().mockResolvedValue({ id: "lead1", source: "instagram", tags: [{ tag: { name: "vip" } }], fieldValues: [] }),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0)
    },
    scoringRule: { findMany: vi.fn().mockResolvedValue([]) },
    routingRule: { findMany: vi.fn().mockResolvedValue([]) },
    membership: { findMany: vi.fn().mockResolvedValue([]) },
    assignment: { create: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "ws1", slaMinutes: 30 }) },
    slaTimer: { create: vi.fn().mockResolvedValue({ id: "timer1" }) },
    $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    ...overrides
  };
}

function makePrisma(client: ReturnType<typeof makeClient>) {
  return { client } as unknown as PrismaService;
}

function makeQueue() {
  return { add: vi.fn() } as unknown as QueueService;
}

describe("RoutingEngineService.applyToNewLead", () => {
  it("computes and stores the lead's score from matching scoring rules", async () => {
    const client = makeClient({
      scoringRule: {
        findMany: vi.fn().mockResolvedValue([
          { condition: { field: "tag", operator: "contains", value: "vip" }, points: 25 }
        ])
      },
      membership: { findMany: vi.fn().mockResolvedValue([{ userId: "u1", available: true }]) }
    });
    const queue = makeQueue();
    const service = new RoutingEngineService(makePrisma(client), queue);

    await service.applyToNewLead("ws1", "lead1");

    expect(client.lead.update).toHaveBeenCalledWith({ where: { id: "lead1" }, data: { score: 25 } });
  });

  it("does not write a score update when no rule matches", async () => {
    const client = makeClient({ membership: { findMany: vi.fn().mockResolvedValue([{ userId: "u1", available: true }]) } });
    const service = new RoutingEngineService(makePrisma(client), makeQueue());

    await service.applyToNewLead("ws1", "lead1");

    expect(client.lead.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ score: expect.anything() }) }));
  });

  it("routes to the least-busy available member when no routing rule matches (fallback)", async () => {
    const client = makeClient({
      membership: {
        findMany: vi.fn().mockResolvedValue([
          { userId: "busy", available: true },
          { userId: "free", available: true }
        ])
      },
      lead: {
        findUnique: vi.fn().mockResolvedValue({ id: "lead1", source: "instagram", tags: [], fieldValues: [] }),
        update: vi.fn(),
        count: vi.fn().mockImplementation(({ where }: { where: { ownerId: string } }) =>
          Promise.resolve(where.ownerId === "busy" ? 5 : 0)
        )
      }
    });
    const service = new RoutingEngineService(makePrisma(client), makeQueue());

    await service.applyToNewLead("ws1", "lead1");

    expect(client.lead.update).toHaveBeenCalledWith({ where: { id: "lead1" }, data: { ownerId: "free" } });
    expect(client.assignment.create).toHaveBeenCalledWith({ data: { leadId: "lead1", userId: "free", reassignedFromId: null } });
  });

  it("starts an SLA timer and queues the salesperson alert once assigned", async () => {
    const client = makeClient({ membership: { findMany: vi.fn().mockResolvedValue([{ userId: "u1", available: true }]) } });
    const queue = makeQueue();
    const service = new RoutingEngineService(makePrisma(client), queue);

    await service.applyToNewLead("ws1", "lead1");

    expect(client.slaTimer.create).toHaveBeenCalledWith({
      data: { workspaceId: "ws1", leadId: "lead1", dueAt: expect.any(Date) }
    });
    expect(queue.add).toHaveBeenCalledWith("routing", "salesperson_alert", { workspaceId: "ws1", leadId: "lead1", userId: "u1" });
    expect(queue.add).toHaveBeenCalledWith("routing", "sla_check", { slaTimerId: "timer1" }, 30 * 60_000);
  });

  it("leaves the lead unassigned without throwing when no member is available", async () => {
    const client = makeClient({ membership: { findMany: vi.fn().mockResolvedValue([]) } });
    const service = new RoutingEngineService(makePrisma(client), makeQueue());

    await expect(service.applyToNewLead("ws1", "lead1")).resolves.toBeUndefined();
    expect(client.assignment.create).not.toHaveBeenCalled();
  });

  it("swallows errors so a routing failure never throws out of lead creation", async () => {
    const client = makeClient({ lead: { findUnique: vi.fn().mockRejectedValue(new Error("db down")), update: vi.fn(), count: vi.fn() } });
    const service = new RoutingEngineService(makePrisma(client), makeQueue());

    await expect(service.applyToNewLead("ws1", "lead1")).resolves.toBeUndefined();
  });
});
