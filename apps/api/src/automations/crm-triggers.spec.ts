import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { QueueService } from "../queue/queue.service";
import { AutomationsService } from "./automations.service";
import { setTriggerSchema } from "./dto/automations.dto";
import { TriggerEventsService } from "./trigger-events.service";

function candidate(id: string, type: string, config: unknown) {
  return { id, trigger: { type, config }, versions: [{ id: `${id}-v1` }] };
}

function setup(automations: unknown[], lead: Record<string, unknown> = {}) {
  const client = {
    automation: { findMany: vi.fn().mockResolvedValue(automations) },
    lead: { findUnique: vi.fn().mockResolvedValue({ source: "whatsapp", tags: [{ tag: { name: "vip" } }], fieldValues: [], ...lead }) },
    automationRun: { findMany: vi.fn().mockResolvedValue([]) },
    conversation: { findFirst: vi.fn().mockResolvedValue({ id: "conv1" }) }
  };
  const queue = { add: vi.fn() };
  return { service: new TriggerEventsService({ client } as unknown as PrismaService, queue as unknown as QueueService), queue, client };
}

describe("TriggerEventsService stage and score events", () => {
  it("starts a stage_changed automation for the chosen stage only", async () => {
    const { service, queue, client } = setup([candidate("a1", "stage_changed", { stageId: "s2" }), candidate("a2", "stage_changed", { stageId: "s9" }), candidate("a3", "stage_changed", { stageId: null })]);
    await service.fireStageChanged("ws1", "lead1", "s2");
    expect(client.automation.findMany.mock.calls[0]![0].where).toMatchObject({ workspaceId: "ws1", status: "live", trigger: { type: "stage_changed" } });
    expect(queue.add.mock.calls.map((c) => (c[2] as { automationId: string }).automationId)).toEqual(["a1", "a3"]);
  });

  it("starts a score_reached automation only when the score crosses its line", async () => {
    const { service, queue } = setup([candidate("a1", "score_reached", { threshold: 50 })]);
    await service.fireScoreChanged("ws1", "lead1", 40, 60);
    expect(queue.add).toHaveBeenCalledTimes(1);
    queue.add.mockClear();
    await service.fireScoreChanged("ws1", "lead1", 55, 80); // already above
    await service.fireScoreChanged("ws1", "lead1", 20, 30); // not there yet
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("does not even look up automations when the score did not rise", async () => {
    const { service, client } = setup([]);
    await service.fireScoreChanged("ws1", "lead1", 60, 40);
    await service.fireScoreChanged("ws1", "lead1", 60, 60);
    expect(client.automation.findMany).not.toHaveBeenCalled();
  });

  it("applies 'any' conditions as OR and 'all' (default) as AND", async () => {
    const conditions = [
      { field: "source", operator: "equals", value: "instagram" },
      { field: "tag", operator: "equals", value: "vip" }
    ];
    const any = setup([candidate("a1", "stage_changed", { stageId: null, conditions, conditionMode: "any" })]); // lead: whatsapp + vip
    await any.service.fireStageChanged("ws1", "lead1", "s1");
    expect(any.queue.add).toHaveBeenCalledTimes(1);

    const all = setup([candidate("a1", "stage_changed", { stageId: null, conditions })]);
    await all.service.fireStageChanged("ws1", "lead1", "s1");
    expect(all.queue.add).not.toHaveBeenCalled();
  });

  it("respects once-per-lead and the delay limit", async () => {
    const { service, queue, client } = setup([candidate("a1", "score_reached", { threshold: 10, limits: { onceForLead: true, delayMinutes: 5 } })]);
    client.automationRun.findMany.mockResolvedValue([{ automationId: "a1", status: "completed" }]);
    await service.fireScoreChanged("ws1", "lead1", 0, 20);
    expect(queue.add).not.toHaveBeenCalled(); // already ran for this lead

    client.automationRun.findMany.mockResolvedValue([]);
    await service.fireScoreChanged("ws1", "lead1", 0, 20);
    expect(queue.add.mock.calls[0]![3]).toBe(5 * 60_000);
  });
});

describe("trigger configuration", () => {
  it("accepts the new trigger types and the condition mode", () => {
    expect(setTriggerSchema.safeParse({ type: "stage_changed", config: { stageId: null }, conditionMode: "any" }).success).toBe(true);
    expect(setTriggerSchema.safeParse({ type: "score_reached", config: { threshold: 60 } }).success).toBe(true);
  });

  it("rejects a bad threshold, a bad mode and a mismatched config", () => {
    expect(setTriggerSchema.safeParse({ type: "score_reached", config: { threshold: 0 } }).success).toBe(false);
    expect(setTriggerSchema.safeParse({ type: "score_reached", config: { threshold: 5000 } }).success).toBe(false);
    expect(setTriggerSchema.safeParse({ type: "stage_changed", config: { stageId: null }, conditionMode: "some" }).success).toBe(false);
    expect(setTriggerSchema.safeParse({ type: "stage_changed", config: { tagName: "x" } }).success).toBe(false);
  });

  it("only lets a stage trigger name a stage of the same workspace", async () => {
    const client = {
      automation: { findFirst: vi.fn().mockResolvedValue({ id: "auto1", workspaceId: "ws1", triggerId: null, versions: [], runs: [] }), update: vi.fn() },
      trigger: { create: vi.fn().mockResolvedValue({ id: "t1" }) },
      stage: { findFirst: vi.fn().mockResolvedValue(null) }
    };
    const service = new AutomationsService({ client } as unknown as PrismaService, { log: vi.fn() } as unknown as AuditService);
    await expect(service.setTrigger("ws1", "auto1", "u1", { type: "stage_changed", config: { stageId: "foreign-stage" } })).rejects.toThrow(BadRequestException);
    expect(client.stage.findFirst).toHaveBeenCalledWith({ where: { id: "foreign-stage", pipeline: { workspaceId: "ws1" } }, select: { id: true } });
    expect(client.trigger.create).not.toHaveBeenCalled();
  });

  it("stores the condition mode with the trigger", async () => {
    const client = {
      automation: { findFirst: vi.fn().mockResolvedValue({ id: "auto1", workspaceId: "ws1", triggerId: null, versions: [], runs: [] }), update: vi.fn(), findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "auto1" }) },
      trigger: { create: vi.fn().mockResolvedValue({ id: "t1" }) }
    };
    const service = new AutomationsService({ client } as unknown as PrismaService, { log: vi.fn() } as unknown as AuditService);
    vi.spyOn(service, "getById").mockResolvedValue({} as never);
    await service.setTrigger("ws1", "auto1", "u1", { type: "score_reached", config: { threshold: 70 }, conditions: [{ field: "source", operator: "equals", value: "instagram" }], conditionMode: "any" });
    expect(client.trigger.create.mock.calls[0]![0].data.config).toMatchObject({ threshold: 70, conditionMode: "any" });
  });
});
