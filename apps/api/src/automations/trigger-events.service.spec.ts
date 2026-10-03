import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { QueueService } from "../queue/queue.service";
import { TriggerEventsService } from "./trigger-events.service";

function candidate(id: string, config: unknown, hasPublishedVersion = true) {
  return { id, trigger: { type: "tag_added", config }, versions: hasPublishedVersion ? [{ id: `${id}-v1` }] : [] };
}

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    automation: { findMany: vi.fn().mockResolvedValue([]) },
    lead: {
      findUnique: vi.fn().mockResolvedValue({ source: "manual", tags: [{ tag: { name: "hot" } }], fieldValues: [] })
    },
    automationRun: { findMany: vi.fn().mockResolvedValue([]) },
    conversation: { findFirst: vi.fn().mockResolvedValue({ id: "conv1" }) },
    ...overrides
  };
}

function makeService(client: ReturnType<typeof makeClient>) {
  const queue = { add: vi.fn() };
  return {
    service: new TriggerEventsService({ client } as unknown as PrismaService, queue as unknown as QueueService),
    queue
  };
}

describe("TriggerEventsService.fireTagAdded", () => {
  it("starts a matching automation via the automation-engine queue", async () => {
    const client = makeClient({ automation: { findMany: vi.fn().mockResolvedValue([candidate("a1", { tagName: "hot" })]) } });
    const { service, queue } = makeService(client);

    await service.fireTagAdded("ws1", "lead1", "hot");

    expect(queue.add).toHaveBeenCalledWith("automation-engine", "start", { automationId: "a1", leadId: "lead1", conversationId: "conv1" }, 0);
  });

  it("treats a null tagName as 'any tag'", async () => {
    const client = makeClient({ automation: { findMany: vi.fn().mockResolvedValue([candidate("a1", { tagName: null })]) } });
    const { service, queue } = makeService(client);

    await service.fireTagAdded("ws1", "lead1", "whatever");

    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it("ignores an automation configured for a different tag", async () => {
    const client = makeClient({ automation: { findMany: vi.fn().mockResolvedValue([candidate("a1", { tagName: "vip" })]) } });
    const { service, queue } = makeService(client);

    await service.fireTagAdded("ws1", "lead1", "hot");

    expect(queue.add).not.toHaveBeenCalled();
  });

  it("ignores an automation with no published version", async () => {
    const client = makeClient({ automation: { findMany: vi.fn().mockResolvedValue([candidate("a1", { tagName: "hot" }, false)]) } });
    const { service, queue } = makeService(client);

    await service.fireTagAdded("ws1", "lead1", "hot");

    expect(queue.add).not.toHaveBeenCalled();
  });

  it("requires extra conditions to match the lead", async () => {
    const config = { tagName: "hot", conditions: [{ field: "source", operator: "equals", value: "instagram" }] };
    const client = makeClient({ automation: { findMany: vi.fn().mockResolvedValue([candidate("a1", config)]) } });
    const { service, queue } = makeService(client);

    await service.fireTagAdded("ws1", "lead1", "hot"); // lead source is "manual"

    expect(queue.add).not.toHaveBeenCalled();
  });

  it("honours onceForLead and the delay limit", async () => {
    const client = makeClient({
      automation: {
        findMany: vi.fn().mockResolvedValue([
          candidate("once", { tagName: "hot", limits: { onceForLead: true } }),
          candidate("delayed", { tagName: "hot", limits: { delayMinutes: 5 } })
        ])
      },
      automationRun: { findMany: vi.fn().mockResolvedValue([{ automationId: "once", status: "completed" }]) }
    });
    const { service, queue } = makeService(client);

    await service.fireTagAdded("ws1", "lead1", "hot");

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith("automation-engine", "start", expect.objectContaining({ automationId: "delayed" }), 300_000);
  });

  it("skips when the lead has no conversation to send through", async () => {
    const client = makeClient({
      automation: { findMany: vi.fn().mockResolvedValue([candidate("a1", { tagName: "hot" })]) },
      conversation: { findFirst: vi.fn().mockResolvedValue(null) }
    });
    const { service, queue } = makeService(client);

    await service.fireTagAdded("ws1", "lead1", "hot");

    expect(queue.add).not.toHaveBeenCalled();
  });
});
