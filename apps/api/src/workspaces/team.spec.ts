import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { UsageService } from "../billing/usage.service";
import type { Mailer } from "../mail/mailer.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { ReferralsService } from "../referrals/referrals.service";
import { WorkspacesService } from "./workspaces.service";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
  process.env.TOKEN_ENCRYPTION_KEY = "a1".repeat(32);
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.APP_URL = "https://app.example.test";
});

function make(client: Record<string, unknown>, mailer: Record<string, unknown> = {}) {
  const m = { isConfigured: vi.fn().mockReturnValue(true), send: vi.fn().mockResolvedValue(undefined), ...mailer };
  const audit = { log: vi.fn() };
  const service = new WorkspacesService(
    { client } as unknown as PrismaService,
    audit as unknown as AuditService,
    { checkUserLimit: vi.fn().mockResolvedValue({ allowed: true }) } as unknown as UsageService,
    {} as ReferralsService,
    m as unknown as Mailer
  );
  return { service, mailer: m, audit };
}

describe("inviting by email", () => {
  const client = () => ({
    membership: { findUnique: vi.fn().mockResolvedValue({ id: "m1", role: "owner" }) },
    invite: { create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "inv1", ...data })) },
    workspace: { findUnique: vi.fn().mockResolvedValue({ name: "Asha Clinic" }) },
    user: { findUnique: vi.fn().mockResolvedValue({ name: "Asha", email: "asha@x.co" }) }
  });

  it("emails the invitation with a link to the accept page, and says so", async () => {
    const { service, mailer } = make(client());
    const r = await service.invite("ws1", "u1", { email: "Ravi@X.co", role: "sales" } as never);
    expect(r.emailed).toBe(true);
    const msg = mailer.send.mock.calls[0]![0];
    expect(msg.to).toBe("ravi@x.co");
    expect(msg.subject).toBe("Asha invited you to Asha Clinic on Zenora");
    expect(msg.text).toContain(`https://app.example.test/invite/${r.token}`);
    expect(msg.text).toContain("ravi@x.co");
  });

  it("still creates the invite when email is not set up, and says it was not emailed", async () => {
    const { service, mailer } = make(client(), { isConfigured: vi.fn().mockReturnValue(false) });
    const r = await service.invite("ws1", "u1", { email: "ravi@x.co", role: "sales" } as never);
    expect(r.emailed).toBe(false);
    expect(r.token).toBeTruthy(); // the inviter can copy the link
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("still creates the invite when the email fails to send", async () => {
    const { service } = make(client(), { send: vi.fn().mockRejectedValue(new Error("smtp down")) });
    const r = await service.invite("ws1", "u1", { email: "ravi@x.co", role: "sales" } as never);
    expect(r.emailed).toBe(false);
    expect(r.id).toBe("inv1");
  });
});

describe("pending invites", () => {
  it("lists only pending, unexpired invites of this workspace", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await make({ invite: { findMany } }).service.listInvites("ws1");
    expect(findMany.mock.calls[0]![0].where).toMatchObject({ workspaceId: "ws1", status: "pending", expiresAt: { gt: expect.any(Date) } });
  });

  it("revokes one within the workspace, and refuses an unknown, foreign or already-used one", async () => {
    const updateMany = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const { service, audit } = make({ invite: { updateMany } });
    await expect(service.revokeInvite("ws1", "inv1", "u1")).resolves.toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "inv1", workspaceId: "ws1", status: "pending" }, data: { status: "revoked" } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "member.invite_revoked" }));
    await expect(service.revokeInvite("ws1", "inv-other", "u1")).rejects.toThrow(NotFoundException);
  });

  it("shows the invite page what it needs, and nothing for a bad, used or expired link", async () => {
    const valid = { status: "pending", expiresAt: new Date(Date.now() + 60_000), role: "sales", email: "ravi@x.co", workspace: { name: "Asha Clinic" } };
    const find = vi.fn().mockResolvedValue(valid);
    const { service } = make({ invite: { findUnique: find } });
    expect(await service.inviteInfo("tok")).toEqual({ valid: true, workspaceName: "Asha Clinic", role: "sales", email: "ravi@x.co" });
    find.mockResolvedValue({ ...valid, status: "accepted" });
    expect(await service.inviteInfo("tok")).toEqual({ valid: false });
    find.mockResolvedValue({ ...valid, expiresAt: new Date(Date.now() - 1000) });
    expect(await service.inviteInfo("tok")).toEqual({ valid: false });
    find.mockResolvedValue(null);
    expect(await service.inviteInfo("nope")).toEqual({ valid: false });
  });
});

describe("removing a member", () => {
  function setup(actor: { role: string; userId?: string }, target: { id?: string; role: string; userId: string }, owners = 2) {
    const tx = {
      lead: { updateMany: vi.fn().mockReturnValue("leads") },
      membership: { delete: vi.fn().mockReturnValue("delete") }
    };
    const client = {
      membership: {
        findFirst: vi.fn().mockResolvedValue({ id: target.id ?? "m-target", ...target }),
        findUnique: vi.fn().mockResolvedValue({ id: "m-actor", userId: actor.userId ?? "actor", role: actor.role }),
        count: vi.fn().mockResolvedValue(owners),
        delete: tx.membership.delete
      },
      lead: { updateMany: tx.lead.updateMany },
      $transaction: vi.fn().mockResolvedValue([])
    };
    return { ...make(client), client, tx };
  }

  it("removes the membership and sends their leads back to unassigned, in one step", async () => {
    const { service, client, tx, audit } = setup({ role: "admin" }, { role: "sales", userId: "u-target" });
    await service.removeMember("ws1", "m-target", "actor");
    expect(tx.lead.updateMany).toHaveBeenCalledWith({ where: { workspaceId: "ws1", ownerId: "u-target" }, data: { ownerId: null } });
    expect(tx.membership.delete).toHaveBeenCalledWith({ where: { id: "m-target" } });
    expect(client.$transaction).toHaveBeenCalledWith(["leads", "delete"]);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "member.removed" }));
  });

  it("looks the member up inside the workspace only", async () => {
    const { service, client } = setup({ role: "owner" }, { role: "sales", userId: "u-target" });
    await service.removeMember("ws1", "m-target", "actor");
    expect(client.membership.findFirst).toHaveBeenCalledWith({ where: { id: "m-target", workspaceId: "ws1" } });
    client.membership.findFirst.mockResolvedValue(null);
    await expect(service.removeMember("ws1", "foreign", "actor")).rejects.toThrow(NotFoundException);
  });

  it("applies the role rules: an admin cannot remove an owner, nobody removes the last owner", async () => {
    const a = setup({ role: "admin" }, { role: "owner", userId: "u-owner" });
    await expect(a.service.removeMember("ws1", "m-target", "actor")).rejects.toThrow(ForbiddenException);
    const b = setup({ role: "owner" }, { role: "owner", userId: "u-owner" }, 1);
    await expect(b.service.removeMember("ws1", "m-target", "actor")).rejects.toThrow("at least one owner");
    expect(b.client.$transaction).not.toHaveBeenCalled();
  });

  it("an owner can step out while another owner remains", async () => {
    const { service, client } = setup({ role: "owner", userId: "me" }, { role: "owner", userId: "me" }, 2);
    await service.removeMember("ws1", "m-target", "me");
    expect(client.$transaction).toHaveBeenCalled();
  });
});
