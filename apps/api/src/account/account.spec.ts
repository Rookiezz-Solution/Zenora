import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import { PrivacyService } from "../privacy/privacy.service";
import { AccountService } from "./account.service";

function makeAccount(opts: { owned?: { workspace: { id: string; name: string } }[]; otherOwners?: Record<string, number> } = {}) {
  const client = {
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ email: "Asha@Example.com" }), delete: vi.fn() },
    membership: {
      findMany: vi.fn().mockResolvedValue(opts.owned ?? []),
      count: vi.fn().mockImplementation(({ where }: { where: { workspaceId: string } }) => Promise.resolve(opts.otherOwners?.[where.workspaceId] ?? 0))
    },
    assignment: { deleteMany: vi.fn() },
    $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops))
  };
  return { service: new AccountService({ client } as unknown as PrismaService), client };
}

describe("AccountService.deleteAccount", () => {
  it("needs the account's own email typed exactly (case aside)", async () => {
    const { service, client } = makeAccount();
    await expect(service.deleteAccount("u1", "someone@else.com")).rejects.toBeInstanceOf(BadRequestException);
    expect(client.user.delete).not.toHaveBeenCalled();
    await service.deleteAccount("u1", " asha@example.COM ");
    expect(client.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });

  it("refuses while the person is the only owner of a workspace, naming it", async () => {
    const { service, client } = makeAccount({ owned: [{ workspace: { id: "w1", name: "Asha Clinic" } }, { workspace: { id: "w2", name: "Shared Co" } }], otherOwners: { w2: 1 } });
    const error = await service.deleteAccount("u1", "asha@example.com").catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toContain("Asha Clinic");
    expect(error.message).not.toContain("Shared Co"); // another owner exists there
    expect(client.user.delete).not.toHaveBeenCalled();
  });

  it("allows it when every workspace they own has another owner, removing assignment history first", async () => {
    const { service, client } = makeAccount({ owned: [{ workspace: { id: "w2", name: "Shared Co" } }], otherOwners: { w2: 1 } });
    await expect(service.deleteAccount("u1", "asha@example.com")).resolves.toEqual({ deleted: true });
    expect(client.assignment.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });
});

describe("PrivacyService workspace deletion", () => {
  function makePrivacy(ws: { name: string; deletionScheduledAt: Date | null }) {
    const client = { workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue(ws), update: vi.fn() } };
    const audit = { log: vi.fn() };
    return { service: new PrivacyService({ client } as unknown as PrismaService, audit as unknown as AuditService), client, audit };
  }

  it("schedules deletion a week out only when the exact workspace name is typed", async () => {
    const { service, client, audit } = makePrivacy({ name: "Asha Clinic", deletionScheduledAt: null });
    await expect(service.scheduleDeletion("ws1", "u1", "asha clinic")).rejects.toBeInstanceOf(BadRequestException);
    expect(client.workspace.update).not.toHaveBeenCalled();

    const before = Date.now();
    const result = await service.scheduleDeletion("ws1", "u1", "Asha Clinic");
    const days = (result.scheduledFor.getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "privacy.workspace_deletion_scheduled" }));
  });

  it("refuses to schedule twice, and cancelling needs something scheduled", async () => {
    const scheduled = makePrivacy({ name: "Asha Clinic", deletionScheduledAt: new Date() });
    await expect(scheduled.service.scheduleDeletion("ws1", "u1", "Asha Clinic")).rejects.toBeInstanceOf(BadRequestException);
    await expect(makePrivacy({ name: "x", deletionScheduledAt: null }).service.cancelDeletion("ws1", "u1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("cancelling clears the schedule and is audited", async () => {
    const { service, client, audit } = makePrivacy({ name: "Asha Clinic", deletionScheduledAt: new Date() });
    await service.cancelDeletion("ws1", "u1");
    expect(client.workspace.update).toHaveBeenCalledWith({ where: { id: "ws1" }, data: { deletionScheduledAt: null } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "privacy.workspace_deletion_cancelled" }));
  });
});
