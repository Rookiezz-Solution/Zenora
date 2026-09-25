import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { TasksService } from "./tasks.service";

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    task: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(({ data }) => data),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "t1" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    ...overrides
  };
}

function makeService(client: ReturnType<typeof makeClient>) {
  return new TasksService({ client } as unknown as PrismaService);
}

describe("TasksService.list", () => {
  it("filters to incomplete tasks when completed=false", async () => {
    const client = makeClient();
    const service = makeService(client);

    await service.list("ws1", { completed: "false" });

    expect(client.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ completedAt: null }) })
    );
  });

  it("filters to completed tasks when completed=true", async () => {
    const client = makeClient();
    const service = makeService(client);

    await service.list("ws1", { completed: "true" });

    expect(client.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ completedAt: { not: null } }) })
    );
  });
});

describe("TasksService.update", () => {
  it("sets completedAt when marking a task complete", async () => {
    const client = makeClient();
    const service = makeService(client);

    await service.update("ws1", "t1", { completed: true });

    expect(client.task.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", workspaceId: "ws1" },
      data: { completedAt: expect.any(Date) }
    });
  });

  it("clears completedAt when marking a task incomplete again", async () => {
    const client = makeClient();
    const service = makeService(client);

    await service.update("ws1", "t1", { completed: false });

    expect(client.task.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", workspaceId: "ws1" },
      data: { completedAt: null }
    });
  });

  it("throws NotFoundException when the task isn't in this workspace", async () => {
    const client = makeClient({ task: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } });
    const service = makeService(client);

    await expect(service.update("ws1", "missing", { completed: true })).rejects.toBeInstanceOf(NotFoundException);
  });
});
