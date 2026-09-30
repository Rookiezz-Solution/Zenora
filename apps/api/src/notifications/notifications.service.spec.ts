import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    notification: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn()
    },
    ...overrides
  };
}

function makeService(client: ReturnType<typeof makeClient>) {
  return new NotificationsService({ client } as unknown as PrismaService);
}

describe("NotificationsService.create", () => {
  it("defaults to a workspace-wide app notification", async () => {
    const client = makeClient();
    const service = makeService(client);

    await service.create({ workspaceId: "ws1", type: "ai_credits_low", title: "AI credits 80% used" });

    expect(client.notification.create).toHaveBeenCalledWith({
      data: { workspaceId: "ws1", userId: null, type: "ai_credits_low", title: "AI credits 80% used", body: undefined, channel: "app" }
    });
  });
});

describe("NotificationsService.markRead", () => {
  it("throws when nothing was updated", async () => {
    const client = makeClient({ notification: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), create: vi.fn(), findMany: vi.fn(), findUniqueOrThrow: vi.fn() } });
    const service = makeService(client);

    await expect(service.markRead("ws1", "missing")).rejects.toThrow(NotFoundException);
  });
});
