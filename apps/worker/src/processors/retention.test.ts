import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  workspace: { findMany: vi.fn() },
  message: { deleteMany: vi.fn() },
  metaWebhookEvent: { deleteMany: vi.fn() },
  webhookDelivery: { deleteMany: vi.fn() }
}));
vi.mock("@zenora/db", () => ({ prisma: prismaMock }));

import { processRetentionSweep } from "./retention";

const now = new Date("2026-10-10T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.workspace.findMany.mockResolvedValue([]);
  prismaMock.message.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.metaWebhookEvent.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.webhookDelivery.deleteMany.mockResolvedValue({ count: 0 });
});

describe("processRetentionSweep", () => {
  it("deletes messages older than each workspace's own period, and only for workspaces that chose one", async () => {
    prismaMock.workspace.findMany.mockResolvedValue([{ id: "a", messageRetentionDays: 90 }, { id: "b", messageRetentionDays: 365 }]);
    prismaMock.message.deleteMany.mockResolvedValueOnce({ count: 5 }).mockResolvedValueOnce({ count: 2 });

    const result = await processRetentionSweep(now);

    expect(prismaMock.workspace.findMany).toHaveBeenCalledWith({ where: { messageRetentionDays: { not: null } }, select: { id: true, messageRetentionDays: true } });
    const [first, second] = prismaMock.message.deleteMany.mock.calls.map((c) => c[0].where);
    expect(first).toEqual({ conversation: { workspaceId: "a" }, createdAt: { lt: new Date("2026-07-12T00:00:00Z") } });
    expect(second).toEqual({ conversation: { workspaceId: "b" }, createdAt: { lt: new Date("2025-10-10T00:00:00Z") } });
    expect(result.messages).toBe(7);
  });

  it("always clears raw webhook payloads and delivery logs older than 30 days", async () => {
    prismaMock.metaWebhookEvent.deleteMany.mockResolvedValue({ count: 9 });
    prismaMock.webhookDelivery.deleteMany.mockResolvedValue({ count: 4 });

    const result = await processRetentionSweep(now);

    const cutoff = new Date("2026-09-10T00:00:00Z");
    expect(prismaMock.metaWebhookEvent.deleteMany).toHaveBeenCalledWith({ where: { receivedAt: { lt: cutoff } } });
    expect(prismaMock.webhookDelivery.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: cutoff } } });
    expect(result).toEqual({ messages: 0, rawEvents: 9, webhookDeliveries: 4 });
    expect(prismaMock.message.deleteMany).not.toHaveBeenCalled(); // nobody opted in to message retention
  });
});
