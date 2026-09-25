import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { MetaGraphClient } from "../channels/meta-graph.client";
import type { PrismaService } from "../prisma/prisma.service";
import type { QueueService } from "../queue/queue.service";
import { BroadcastsService } from "./broadcasts.service";

function makeAudit() {
  return { log: vi.fn() } as unknown as AuditService;
}

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    leadIdentity: { findMany: vi.fn().mockResolvedValue([{ leadId: "l1" }, { leadId: "l2" }, { leadId: "l3" }]) },
    leadTag: { findMany: vi.fn() },
    consent: { findMany: vi.fn() },
    message: { findMany: vi.fn() },
    waTemplate: { findFirst: vi.fn() },
    broadcast: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    broadcastRecipient: { createMany: vi.fn() },
    $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    ...overrides
  };
}

describe("BroadcastsService.estimateAudience", () => {
  it("narrows the audience through tag, opt-in, and recently-messaged filters in sequence", async () => {
    const client = makeClient();
    client.leadTag.findMany.mockResolvedValue([{ leadId: "l1" }, { leadId: "l2" }]);
    client.consent.findMany.mockResolvedValue([{ leadId: "l1" }]);
    const prisma = { client } as unknown as PrismaService;
    const service = new BroadcastsService(prisma, makeAudit(), {} as MetaGraphClient, {} as QueueService);

    const result = await service.estimateAudience("ws1", { tag: "vip", optedInOnly: true });

    expect(result.count).toBe(1);
    expect(client.leadTag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ leadId: { in: ["l1", "l2", "l3"] } }) })
    );
    expect(client.consent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ leadId: { in: ["l1", "l2"] } }) })
    );
  });

  it("skips the opt-in filter when optedInOnly is false", async () => {
    const client = makeClient();
    const prisma = { client } as unknown as PrismaService;
    const service = new BroadcastsService(prisma, makeAudit(), {} as MetaGraphClient, {} as QueueService);

    const result = await service.estimateAudience("ws1", { optedInOnly: false });

    expect(result.count).toBe(3);
    expect(client.consent.findMany).not.toHaveBeenCalled();
  });

  it("returns zero immediately when no leads have a WhatsApp identity, without querying further filters", async () => {
    const client = makeClient();
    client.leadIdentity.findMany.mockResolvedValue([]);
    const prisma = { client } as unknown as PrismaService;
    const service = new BroadcastsService(prisma, makeAudit(), {} as MetaGraphClient, {} as QueueService);

    const result = await service.estimateAudience("ws1", { optedInOnly: true });

    expect(result.count).toBe(0);
    expect(client.consent.findMany).not.toHaveBeenCalled();
  });
});

describe("BroadcastsService.create", () => {
  it("refuses to build a broadcast on a template that isn't approved yet", async () => {
    const client = makeClient();
    client.waTemplate.findFirst.mockResolvedValue({ id: "t1", category: "marketing", metaStatus: "pending" });
    const prisma = { client } as unknown as PrismaService;
    const service = new BroadcastsService(prisma, makeAudit(), {} as MetaGraphClient, {} as QueueService);

    await expect(
      service.create("ws1", "user1", { templateId: "t1", audienceFilter: { optedInOnly: true } })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("prices the cost estimate by the template's category rate times the audience size", async () => {
    const client = makeClient();
    client.waTemplate.findFirst.mockResolvedValue({ id: "t1", category: "marketing", metaStatus: "approved" });
    client.consent.findMany.mockResolvedValue([{ leadId: "l1" }, { leadId: "l2" }, { leadId: "l3" }]);
    client.broadcast.create.mockImplementation(({ data }: { data: unknown }) => data);
    const prisma = { client } as unknown as PrismaService;
    const service = new BroadcastsService(prisma, makeAudit(), {} as MetaGraphClient, {} as QueueService);

    const broadcast = await service.create("ws1", "user1", { templateId: "t1", audienceFilter: { optedInOnly: true } });

    expect((broadcast as { costEstimate: number }).costEstimate).toBe(3 * 86); // marketing rate in paise
  });
});

describe("BroadcastsService.send", () => {
  it("materializes a BroadcastRecipient per resolved lead and marks the broadcast sending", async () => {
    const client = makeClient();
    client.consent.findMany.mockResolvedValue([{ leadId: "l1" }, { leadId: "l2" }, { leadId: "l3" }]);
    client.broadcast.findFirst.mockResolvedValue({
      id: "b1",
      status: "draft",
      scheduledAt: null,
      audienceFilter: { optedInOnly: true },
      template: {},
      recipients: []
    });
    const queue = { add: vi.fn() } as unknown as QueueService;
    const prisma = { client } as unknown as PrismaService;
    const service = new BroadcastsService(prisma, makeAudit(), {} as MetaGraphClient, queue);

    await service.send("ws1", "b1", "user1");

    expect(client.broadcastRecipient.createMany).toHaveBeenCalledWith({
      data: [{ broadcastId: "b1", leadId: "l1" }, { broadcastId: "b1", leadId: "l2" }, { broadcastId: "b1", leadId: "l3" }]
    });
    expect(client.broadcast.update).toHaveBeenCalledWith({ where: { id: "b1" }, data: { status: "sending" } });
    expect(queue.add).toHaveBeenCalledWith("broadcasts", "send", { broadcastId: "b1" }, 0);
  });

  it("marks a future-scheduled broadcast as scheduled and delays the queue job accordingly", async () => {
    const client = makeClient();
    client.consent.findMany.mockResolvedValue([{ leadId: "l1" }]);
    const future = new Date(Date.now() + 60 * 60 * 1000);
    client.broadcast.findFirst.mockResolvedValue({
      id: "b1",
      status: "draft",
      scheduledAt: future,
      audienceFilter: { optedInOnly: true },
      template: {},
      recipients: []
    });
    const queue = { add: vi.fn() } as unknown as QueueService;
    const prisma = { client } as unknown as PrismaService;
    const service = new BroadcastsService(prisma, makeAudit(), {} as MetaGraphClient, queue);

    await service.send("ws1", "b1", "user1");

    expect(client.broadcast.update).toHaveBeenCalledWith({ where: { id: "b1" }, data: { status: "scheduled" } });
    const delayArg = (queue.add as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(delayArg).toBeGreaterThan(0);
    expect(delayArg).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it("refuses to send a broadcast that isn't a draft anymore", async () => {
    const client = makeClient();
    client.broadcast.findFirst.mockResolvedValue({ id: "b1", status: "sent", template: {}, recipients: [] });
    const prisma = { client } as unknown as PrismaService;
    const service = new BroadcastsService(prisma, makeAudit(), {} as MetaGraphClient, {} as QueueService);

    await expect(service.send("ws1", "b1", "user1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses to send when nobody matches the audience filter", async () => {
    const client = makeClient();
    client.leadIdentity.findMany.mockResolvedValue([]);
    client.broadcast.findFirst.mockResolvedValue({
      id: "b1",
      status: "draft",
      scheduledAt: null,
      audienceFilter: { optedInOnly: true },
      template: {},
      recipients: []
    });
    const prisma = { client } as unknown as PrismaService;
    const service = new BroadcastsService(prisma, makeAudit(), {} as MetaGraphClient, {} as QueueService);

    await expect(service.send("ws1", "b1", "user1")).rejects.toBeInstanceOf(BadRequestException);
  });
});
