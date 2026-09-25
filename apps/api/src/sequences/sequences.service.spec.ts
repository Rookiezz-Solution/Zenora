import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { QueueService } from "../queue/queue.service";
import { SequencesService } from "./sequences.service";

const steps = [
  { waitHours: 1, action: { type: "send_text", body: "Hi!" } },
  { waitHours: 24, action: { type: "tag", tagName: "followed-up" } }
];

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    sequence: { findFirst: vi.fn().mockResolvedValue({ id: "seq1", workspaceId: "ws1", steps }) },
    sequenceEnrollment: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(({ data }) => ({ id: `enr-${data.leadId}`, ...data })),
      updateMany: vi.fn()
    },
    ...overrides
  };
}

function makeService(client: ReturnType<typeof makeClient>, queue = { add: vi.fn() }) {
  return { service: new SequencesService({ client } as unknown as PrismaService, queue as unknown as QueueService), queue };
}

describe("SequencesService.enroll", () => {
  it("enrolls every lead and queues the first step delayed by its waitHours", async () => {
    const client = makeClient();
    const { service, queue } = makeService(client);

    const result = await service.enroll("ws1", "seq1", { leadIds: ["l1", "l2"] });

    expect(result).toEqual({ enrolled: 2, skipped: 0 });
    expect(queue.add).toHaveBeenCalledWith("sequences", "step", { enrollmentId: "enr-l1" }, 1 * 3_600_000);
    expect(queue.add).toHaveBeenCalledWith("sequences", "step", { enrollmentId: "enr-l2" }, 1 * 3_600_000);
  });

  it("skips leads that already have an active enrollment in this sequence", async () => {
    const client = makeClient({
      sequenceEnrollment: {
        findMany: vi.fn().mockResolvedValue([{ leadId: "l1" }]),
        create: vi.fn().mockImplementation(({ data }) => ({ id: `enr-${data.leadId}`, ...data })),
        updateMany: vi.fn()
      }
    });
    const { service, queue } = makeService(client);

    const result = await service.enroll("ws1", "seq1", { leadIds: ["l1", "l2"] });

    expect(result).toEqual({ enrolled: 1, skipped: 1 });
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith("sequences", "step", { enrollmentId: "enr-l2" }, expect.any(Number));
  });

  it("throws NotFoundException for a sequence outside this workspace", async () => {
    const client = makeClient({ sequence: { findFirst: vi.fn().mockResolvedValue(null) } });
    const { service } = makeService(client);

    await expect(service.enroll("ws1", "missing", { leadIds: ["l1"] })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("SequencesService.stop", () => {
  it("marks only active enrollments for that lead as stopped", async () => {
    const client = makeClient();
    const { service } = makeService(client);

    await service.stop("ws1", "seq1", "l1");

    expect(client.sequenceEnrollment.updateMany).toHaveBeenCalledWith({
      where: { sequenceId: "seq1", leadId: "l1", status: "active" },
      data: { status: "stopped" }
    });
  });
});
