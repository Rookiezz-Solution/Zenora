import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import { LeadsService } from "./leads.service";

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
    const service = new LeadsService(prisma, makeAudit());

    await service.merge("ws1", "user1", { primaryLeadId: "primary", duplicateLeadId: "dup" });

    expect(tx.leadIdentity.updateMany).toHaveBeenCalledWith({ where: { leadId: "dup" }, data: { leadId: "primary" } });
    expect(tx.note.updateMany).toHaveBeenCalledWith({ where: { leadId: "dup" }, data: { leadId: "primary" } });
    expect(tx.conversation.updateMany).toHaveBeenCalledWith({ where: { leadId: "dup" }, data: { leadId: "primary" } });
    expect(tx.task.updateMany).toHaveBeenCalledWith({ where: { leadId: "dup" }, data: { leadId: "primary" } });
  });

  it("re-points every tag from the duplicate onto the primary without violating the (leadId, tagId) primary key", async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const service = new LeadsService(prisma, makeAudit());

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
    const service = new LeadsService(prisma, makeAudit());

    await service.merge("ws1", "user1", { primaryLeadId: "primary", duplicateLeadId: "dup" });

    expect(tx.lead.update).toHaveBeenCalledWith({
      where: { id: "primary" },
      data: { name: "Primary", phone: "111", email: "dup@example.com" }
    });
  });

  it("marks the duplicate as merged into the primary", async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const service = new LeadsService(prisma, makeAudit());

    await service.merge("ws1", "user1", { primaryLeadId: "primary", duplicateLeadId: "dup" });

    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: "dup" }, data: { mergedIntoId: "primary" } });
  });

  it("refuses to merge a lead into itself", async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const service = new LeadsService(prisma, makeAudit());

    await expect(service.merge("ws1", "user1", { primaryLeadId: "primary", duplicateLeadId: "primary" })).rejects.toBeInstanceOf(
      ConflictException
    );
  });
});
