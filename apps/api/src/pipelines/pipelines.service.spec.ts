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
    (prisma.client.stage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
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

describe("PipelinesService.reorderStages validation", () => {
  const setup = (existing: string[]) => {
    const prisma = makePrisma();
    (prisma.client.stage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(existing.map((id) => ({ id })));
    return { prisma, service: new PipelinesService(prisma, makeAudit()) };
  };

  it("refuses an order that leaves a stage out, repeats one, or names a stage from elsewhere", async () => {
    for (const stageIds of [["a", "b"], ["a", "b", "b"], ["a", "b", "x"], ["a", "b", "c", "d"]]) {
      const { prisma, service } = setup(["a", "b", "c"]);
      await expect(service.reorderStages("ws1", "pipe-1", { stageIds })).rejects.toThrow("exactly once");
      expect(prisma.client.stage.updateMany).not.toHaveBeenCalled();
    }
  });
});

describe("PipelinesService.removeStage", () => {
  function setup(leadCount: number) {
    const client = {
      pipeline: { findFirst: vi.fn().mockResolvedValue({ id: "pipe-1", workspaceId: "ws1" }) },
      stage: { findFirst: vi.fn().mockResolvedValue({ id: "s1", pipelineId: "pipe-1" }), delete: vi.fn() },
      lead: { count: vi.fn().mockResolvedValue(leadCount) }
    };
    return { client, service: new PipelinesService({ client } as unknown as PrismaService, makeAudit()) };
  }

  it("deletes an empty stage", async () => {
    const { client, service } = setup(0);
    await service.removeStage("ws1", "pipe-1", "s1");
    expect(client.stage.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
  });

  it("refuses while leads are still in it, saying how many, so none silently fall out of the pipeline", async () => {
    const { client, service } = setup(3);
    await expect(service.removeStage("ws1", "pipe-1", "s1")).rejects.toThrow("Move the 3 leads in this stage to another stage first");
    expect(client.stage.delete).not.toHaveBeenCalled();
    expect(client.lead.count).toHaveBeenCalledWith({ where: { stageId: "s1", mergedIntoId: null } });
  });

  it("uses the singular for one lead", async () => {
    await expect(setup(1).service.removeStage("ws1", "pipe-1", "s1")).rejects.toThrow("Move the 1 lead in this stage");
  });
});
