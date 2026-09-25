import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { RoutingEngineService } from "../routing/routing-engine.service";
import { LeadsService } from "./leads.service";

function makeRoutingEngine() {
  return { applyToNewLead: vi.fn() } as unknown as RoutingEngineService;
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
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine());

    await service.merge("ws1", "user1", { primaryLeadId: "primary", duplicateLeadId: "dup" });

    expect(tx.leadIdentity.updateMany).toHaveBeenCalledWith({ where: { leadId: "dup" }, data: { leadId: "primary" } });
    expect(tx.note.updateMany).toHaveBeenCalledWith({ where: { leadId: "dup" }, data: { leadId: "primary" } });
    expect(tx.conversation.updateMany).toHaveBeenCalledWith({ where: { leadId: "dup" }, data: { leadId: "primary" } });
    expect(tx.task.updateMany).toHaveBeenCalledWith({ where: { leadId: "dup" }, data: { leadId: "primary" } });
  });

  it("re-points every tag from the duplicate onto the primary without violating the (leadId, tagId) primary key", async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine());

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
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine());

    await service.merge("ws1", "user1", { primaryLeadId: "primary", duplicateLeadId: "dup" });

    expect(tx.lead.update).toHaveBeenCalledWith({
      where: { id: "primary" },
      data: { name: "Primary", phone: "111", email: "dup@example.com" }
    });
  });

  it("marks the duplicate as merged into the primary", async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine());

    await service.merge("ws1", "user1", { primaryLeadId: "primary", duplicateLeadId: "dup" });

    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: "dup" }, data: { mergedIntoId: "primary" } });
  });

  it("refuses to merge a lead into itself", async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine());

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

  function makeMoveStagePrisma() {
    const tx = { lead: { update: vi.fn() }, leadFieldValue: { upsert: vi.fn() } };
    const client = {
      lead: {
        findFirst: vi.fn().mockResolvedValue({ id: "lead-1", workspaceId: "ws1" }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "lead-1" })
      },
      stage: { findFirst: vi.fn().mockResolvedValue(stage) },
      customField: { findMany: vi.fn().mockResolvedValue([{ id: "field-budget", label: "Budget" }]) },
      $transaction: vi.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb(tx))
    };
    return { prisma: { client } as unknown as PrismaService, tx };
  }

  it("blocks the move and names the missing required fields when they aren't provided", async () => {
    const { prisma } = makeMoveStagePrisma();
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine());

    const attempt = service.moveStage("ws1", "lead-1", "user1", { stageId: "stage-won" });

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toMatchObject({
      response: { missingFields: [{ id: "field-budget", label: "Budget" }] }
    });
  });

  it("treats an empty string as missing, not provided", async () => {
    const { prisma } = makeMoveStagePrisma();
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine());

    await expect(
      service.moveStage("ws1", "lead-1", "user1", { stageId: "stage-won", fieldValues: { "field-budget": "" } })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("moves the lead and saves the required field values once they're all provided", async () => {
    const { prisma, tx } = makeMoveStagePrisma();
    const service = new LeadsService(prisma, makeAudit(), makeRoutingEngine());

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
    const service = new LeadsService(prisma, audit, makeRoutingEngine());

    await service.moveStage("ws1", "lead-1", "user1", { stageId: "stage-won", fieldValues: { "field-budget": "1" } });

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "lead.marked_won" }));
  });
});
