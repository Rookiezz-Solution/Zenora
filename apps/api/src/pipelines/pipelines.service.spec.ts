import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import { PipelinesService } from "./pipelines.service";

function makePrisma() {
  const pipeline = { id: "pipe-1", workspaceId: "ws1" };
  const client = {
    pipeline: { findFirst: vi.fn().mockResolvedValue(pipeline) },
    stage: {
      aggregate: vi.fn(),
      create: vi.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data)),
      updateMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([])
    },
    $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops))
  };
  return { client } as unknown as PrismaService;
}

function makeAudit() {
  return { log: vi.fn() } as unknown as AuditService;
}

describe("PipelinesService.addStage", () => {
  it("puts the first stage at order 0 when the pipeline has none yet", async () => {
    const prisma = makePrisma();
    (prisma.client.stage.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _max: { order: null } });
    const service = new PipelinesService(prisma, makeAudit());

    await service.addStage("ws1", "pipe-1", { name: "New", type: "open", requiredFieldIds: [] });

    expect(prisma.client.stage.create).toHaveBeenCalledWith({
      data: { pipelineId: "pipe-1", order: 0, name: "New", type: "open", requiredFieldIds: [] }
    });
  });

  it("appends after the current highest order", async () => {
    const prisma = makePrisma();
    (prisma.client.stage.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _max: { order: 3 } });
    const service = new PipelinesService(prisma, makeAudit());

    await service.addStage("ws1", "pipe-1", { name: "New", type: "open", requiredFieldIds: [] });

    expect(prisma.client.stage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ order: 4 }) })
    );
  });
});

describe("PipelinesService.reorderStages", () => {
  it("sets each stage's order to its index in the given list, scoped to the pipeline", async () => {
    const prisma = makePrisma();
    const service = new PipelinesService(prisma, makeAudit());

    await service.reorderStages("ws1", "pipe-1", { stageIds: ["c", "a", "b"] });

    expect(prisma.client.stage.updateMany).toHaveBeenCalledWith({
      where: { id: "c", pipelineId: "pipe-1" },
      data: { order: 0 }
    });
    expect(prisma.client.stage.updateMany).toHaveBeenCalledWith({
      where: { id: "a", pipelineId: "pipe-1" },
      data: { order: 1 }
    });
    expect(prisma.client.stage.updateMany).toHaveBeenCalledWith({
      where: { id: "b", pipelineId: "pipe-1" },
      data: { order: 2 }
    });
  });
});
