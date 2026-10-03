import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AiClient } from "../ai/ai.client";
import type { AuditService } from "../audit/audit.service";
import type { TriggerEventsService } from "../automations/trigger-events.service";
import type { UsageService } from "../billing/usage.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { RoutingEngineService } from "../routing/routing-engine.service";
import { LeadsService } from "./leads.service";

function makeRoutingEngine() {
  return { applyToNewLead: vi.fn() } as unknown as RoutingEngineService;
}

function makeUsage() {
  return {
    checkContactLimit: vi.fn().mockResolvedValue({ allowed: true, limit: 1000, current: 0 }),
    checkAiCredits: vi.fn().mockResolvedValue({ allowed: true, remaining: 49, limit: 50 }),
    debitAiReplyCredit: vi.fn().mockResolvedValue({ allowed: true, remaining: 48 })
  } as unknown as UsageService;
}

function makeTriggerEvents() {
  return { fireTagAdded: vi.fn().mockResolvedValue(undefined) } as unknown as TriggerEventsService;
}

function makeAi() {
  return { scoreLeadIntent: vi.fn().mockResolvedValue({ bonus: 10, reasoning: "Asked about pricing." }) } as unknown as AiClient;
}

function makeTx() {
  return {
    leadIdentity: { updateMany: vi.fn() },
    note: { updateMany: vi.fn() },
    conversation: { updateMany: vi.fn() },
    task: { updateMany: vi.fn() },
    leadTag: {
      findMany: vi.fn().mockResolvedValue([{ leadId: "dup", tagId: "tag-shared" }, { leadId: "dup", tagId: "tag-only-on-dup" }]),
      upsert: vi.fn(),
      deleteMany: vi.fn()
    },
    lead: { update: vi.fn() }
  };
}

function makePrisma(tx: ReturnType<typeof makeTx>) {
  const primary = { id: "primary", workspaceId: "ws1", name: "Primary", phone: "111", email: null };
  const duplicate = { id: "dup", workspaceId: "ws1", name: null, phone: null, email: "dup@example.com" };
  const findFirst = vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(where.id === "primary" ? primary : where.id === "dup" ? duplicate : null)
  );
  const client = {
    lead: { findFirst, findUniqueOrThrow: vi.fn().mockResolvedValue(primary) },
    $transaction: vi.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb(tx))
  };
  return { client } as unknown as PrismaService;
}

function makeAudit() {
  return { log: vi.fn() } as unknown as AuditService;
}

describe("LeadsService.merge", () => {
  it("moves identities, notes, conversations and tasks onto the primary lead", async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine(), makeUsage(), makeAi(), makeTriggerEvents());

    await service.merge("ws1", "user1", { primaryLeadId: "primary", duplicateLeadId: "dup" });

    expect(tx.leadIdentity.updateMany).toHaveBeenCalledWith({ where: { leadId: "dup" }, data: { leadId: "primary" } });
    expect(tx.note.updateMany).toHaveBeenCalledWith({ where: { leadId: "dup" }, data: { leadId: "primary" } });
    expect(tx.conversation.updateMany).toHaveBeenCalledWith({ where: { leadId: "dup" }, data: { leadId: "primary" } });
    expect(tx.task.updateMany).toHaveBeenCalledWith({ where: { leadId: "dup" }, data: { leadId: "primary" } });
  });

  it("re-points every tag from the duplicate onto the primary without violating the (leadId, tagId) primary key", async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine(), makeUsage(), makeAi(), makeTriggerEvents());

    await service.merge("ws1", "user1", { primaryLeadId: "primary", duplicateLeadId: "dup" });

    // upsert (not create) is what makes this safe if the primary already has
    // one of the duplicate's tags.
    expect(tx.leadTag.upsert).toHaveBeenCalledTimes(2);
    expect(tx.leadTag.upsert).toHaveBeenCalledWith({
      where: { leadId_tagId: { leadId: "primary", tagId: "tag-shared" } },
      update: {},
      create: { leadId: "primary", tagId: "tag-shared" }
    });
    expect(tx.leadTag.deleteMany).toHaveBeenCalledWith({ where: { leadId: "dup" } });
  });

  it("keeps the primary's own field values and only fills gaps from the duplicate", async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine(), makeUsage(), makeAi(), makeTriggerEvents());

    await service.merge("ws1", "user1", { primaryLeadId: "primary", duplicateLeadId: "dup" });

    expect(tx.lead.update).toHaveBeenCalledWith({
      where: { id: "primary" },
      data: { name: "Primary", phone: "111", email: "dup@example.com" }
    });
  });

  it("marks the duplicate as merged into the primary", async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine(), makeUsage(), makeAi(), makeTriggerEvents());

    await service.merge("ws1", "user1", { primaryLeadId: "primary", duplicateLeadId: "dup" });

    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: "dup" }, data: { mergedIntoId: "primary" } });
  });

  it("refuses to merge a lead into itself", async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine(), makeUsage(), makeAi(), makeTriggerEvents());

    await expect(service.merge("ws1", "user1", { primaryLeadId: "primary", duplicateLeadId: "primary" })).rejects.toBeInstanceOf(
      ConflictException
    );
  });
});

describe("LeadsService.moveStage", () => {
  const stage = {
    id: "stage-won",
    pipelineId: "pipe-1",
    type: "won",
    name: "Won",
    requiredFieldIds: ["field-budget"]
  };

  function makeMoveStagePrisma(stageOverride: typeof stage = stage) {
    const tx = { lead: { update: vi.fn() }, leadFieldValue: { upsert: vi.fn() } };
    const client = {
      lead: {
        findFirst: vi.fn().mockResolvedValue({ id: "lead-1", workspaceId: "ws1" }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "lead-1" })
      },
      stage: { findFirst: vi.fn().mockResolvedValue(stageOverride) },
      customField: { findMany: vi.fn().mockResolvedValue([{ id: "field-budget", label: "Budget" }]) },
      $transaction: vi.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb(tx))
    };
    return { prisma: { client } as unknown as PrismaService, tx };
  }

  it("blocks the move and names the missing required fields when they aren't provided", async () => {
    const { prisma } = makeMoveStagePrisma();
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine(), makeUsage(), makeAi(), makeTriggerEvents());

    const attempt = service.moveStage("ws1", "lead-1", "user1", { stageId: "stage-won" });

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toMatchObject({
      response: { missingFields: [{ id: "field-budget", label: "Budget" }] }
    });
  });

  it("treats an empty string as missing, not provided", async () => {
    const { prisma } = makeMoveStagePrisma();
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine(), makeUsage(), makeAi(), makeTriggerEvents());

    await expect(
      service.moveStage("ws1", "lead-1", "user1", { stageId: "stage-won", fieldValues: { "field-budget": "" } })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("moves the lead and saves the required field values once they're all provided", async () => {
    const { prisma, tx } = makeMoveStagePrisma();
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine(), makeUsage(), makeAi(), makeTriggerEvents());

    await service.moveStage("ws1", "lead-1", "user1", {
      stageId: "stage-won",
      fieldValues: { "field-budget": "50000" }
    });

    expect(tx.lead.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { stageId: "stage-won", pipelineId: "pipe-1" }
    });
    expect(tx.leadFieldValue.upsert).toHaveBeenCalledWith({
      where: { leadId_fieldId: { leadId: "lead-1", fieldId: "field-budget" } },
      update: { value: "50000" },
      create: { leadId: "lead-1", fieldId: "field-budget", value: "50000" }
    });
  });

  it("logs a distinguishable audit action for a won/lost stage vs. a plain stage change", async () => {
    const { prisma } = makeMoveStagePrisma();
    const audit = makeAudit();
    const service = new LeadsService(prisma, audit, makeRoutingEngine(), makeUsage(), makeAi(), makeTriggerEvents());

    await service.moveStage("ws1", "lead-1", "user1", { stageId: "stage-won", fieldValues: { "field-budget": "1" } });

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "lead.marked_won" }));
  });

  it("captures the lost reason when moving to a lost-type stage", async () => {
    const lostStage = { id: "stage-lost", pipelineId: "pipe-1", type: "lost", name: "Lost", requiredFieldIds: [] };
    const { prisma, tx } = makeMoveStagePrisma(lostStage);
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine(), makeUsage(), makeAi(), makeTriggerEvents());

    await service.moveStage("ws1", "lead-1", "user1", { stageId: "stage-lost", lostReason: "Went with a competitor" });

    expect(tx.lead.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { stageId: "stage-lost", pipelineId: "pipe-1", lostReason: "Went with a competitor" }
    });
  });

  it("does not touch lostReason for a non-lost stage move", async () => {
    const { prisma, tx } = makeMoveStagePrisma();
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine(), makeUsage(), makeAi(), makeTriggerEvents());

    await service.moveStage("ws1", "lead-1", "user1", { stageId: "stage-won", fieldValues: { "field-budget": "1" } });

    expect(tx.lead.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { stageId: "stage-won", pipelineId: "pipe-1" }
    });
  });
});

describe("LeadsService.scoreIntent", () => {
  function makeScoringPrisma(overrides: { lead?: unknown; messages?: unknown[] } = {}) {
    const lead = overrides.lead ?? { id: "lead1", workspaceId: "ws1", ruleScore: 20, aiIntentScore: 0, score: 20 };
    // findMany is ordered createdAt desc (newest first) — the service
    // reverses it to chronological order before sending it to the AI.
    const messages = overrides.messages ?? [
      { direction: "outbound", body: "It's ₹8,999/month." },
      { direction: "inbound", body: "What's the price for the pro plan?" }
    ];
    const client = {
      lead: { findFirst: vi.fn().mockResolvedValue(lead), update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...lead, ...data })) },
      message: { findMany: vi.fn().mockResolvedValue(messages) }
    };
    return { client, lead } as unknown as { client: typeof client; lead: typeof lead } & PrismaService;
  }

  it("throws when the lead doesn't exist", async () => {
    const prisma = { client: { lead: { findFirst: vi.fn().mockResolvedValue(null) }, message: { findMany: vi.fn() } } } as unknown as PrismaService;
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine(), makeUsage(), makeAi(), makeTriggerEvents());

    await expect(service.scoreIntent("ws1", "missing")).rejects.toThrow("Lead not found");
  });

  it("throws when the lead has no conversation yet", async () => {
    const prisma = makeScoringPrisma({ messages: [] });
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine(), makeUsage(), makeAi(), makeTriggerEvents());

    await expect(service.scoreIntent("ws1", "lead1")).rejects.toThrow("No conversation yet to score intent from");
  });

  it("throws when AI credits are exhausted, without calling the AI", async () => {
    const prisma = makeScoringPrisma();
    const usage = makeUsage();
    (usage.checkAiCredits as ReturnType<typeof vi.fn>).mockResolvedValue({ allowed: false, remaining: 0, limit: 50 });
    const ai = makeAi();
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine(), usage, ai, makeTriggerEvents());

    await expect(service.scoreIntent("ws1", "lead1")).rejects.toThrow("AI credits are used up for this month");
    expect(ai.scoreLeadIntent).not.toHaveBeenCalled();
  });

  it("adds the AI bonus on top of the existing rule score and debits a credit", async () => {
    const prisma = makeScoringPrisma();
    const usage = makeUsage();
    const ai = makeAi();
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine(), usage, ai, makeTriggerEvents());

    const result = await service.scoreIntent("ws1", "lead1");

    expect(ai.scoreLeadIntent).toHaveBeenCalledWith([
      { direction: "inbound", body: "What's the price for the pro plan?" },
      { direction: "outbound", body: "It's ₹8,999/month." }
    ]);
    expect(prisma.client.lead.update).toHaveBeenCalledWith({
      where: { id: "lead1" },
      data: { aiIntentScore: 10, aiScoreReasoning: "Asked about pricing.", score: 30 }
    });
    expect(usage.debitAiReplyCredit).toHaveBeenCalledWith("ws1");
    expect(result).toEqual({
      ruleScore: 20,
      aiIntentScore: 10,
      aiScoreReasoning: "Asked about pricing.",
      score: 30,
      creditsRemaining: 48
    });
  });
});

describe("LeadsService.addTag", () => {
  function makeTagPrisma(alreadyTagged: boolean) {
    const client = {
      lead: { findFirst: vi.fn().mockResolvedValue({ id: "lead1", workspaceId: "ws1" }) },
      tag: { upsert: vi.fn().mockResolvedValue({ id: "tag1", name: "hot" }) },
      leadTag: {
        findUnique: vi.fn().mockResolvedValue(alreadyTagged ? { leadId: "lead1", tagId: "tag1" } : null),
        upsert: vi.fn()
      }
    };
    return { client } as unknown as PrismaService;
  }

  it("fires tag_added triggers when the tag is genuinely new on the lead", async () => {
    const triggerEvents = makeTriggerEvents();
    const service = new LeadsService(makeTagPrisma(false), makeAudit(), makeRoutingEngine(), makeUsage(), makeAi(), triggerEvents);

    await service.addTag("ws1", "lead1", "user1", { name: "hot" });

    expect(triggerEvents.fireTagAdded).toHaveBeenCalledWith("ws1", "lead1", "hot");
  });

  it("doesn't re-fire when the lead already had the tag", async () => {
    const triggerEvents = makeTriggerEvents();
    const service = new LeadsService(makeTagPrisma(true), makeAudit(), makeRoutingEngine(), makeUsage(), makeAi(), triggerEvents);

    await service.addTag("ws1", "lead1", "user1", { name: "hot" });

    expect(triggerEvents.fireTagAdded).not.toHaveBeenCalled();
  });

  it("still tags the lead if the trigger machinery fails", async () => {
    const triggerEvents = { fireTagAdded: vi.fn().mockRejectedValue(new Error("redis down")) } as unknown as TriggerEventsService;
    const service = new LeadsService(makeTagPrisma(false), makeAudit(), makeRoutingEngine(), makeUsage(), makeAi(), triggerEvents);

    await expect(service.addTag("ws1", "lead1", "user1", { name: "hot" })).resolves.toMatchObject({ id: "tag1" });
  });
});
