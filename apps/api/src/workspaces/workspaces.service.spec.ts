import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { UsageService } from "../billing/usage.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { ReferralsService } from "../referrals/referrals.service";
import { WorkspacesService } from "./workspaces.service";

function make(client: Record<string, unknown> = {}) {
  const tx = { membership: { create: vi.fn().mockResolvedValue({ id: "m-new" }) }, invite: { update: vi.fn() } };
  const full = {
    membership: {
      findFirst: vi.fn().mockResolvedValue({ id: "m-target", userId: "u-target", role: "sales" }),
      findUnique: vi.fn().mockResolvedValue({ id: "m-actor", userId: "u-actor", role: "admin" }),
      count: vi.fn().mockResolvedValue(1),
      update: vi.fn().mockResolvedValue({ id: "m-target" })
    },
    invite: { findUnique: vi.fn(), create: vi.fn().mockResolvedValue({ id: "inv1" }) },
    user: { findUnique: vi.fn() },
    workspace: { create: vi.fn().mockResolvedValue({ id: "ws-new" }) },
    $transaction: vi.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
    ...client
  };
  const usage = { checkUserLimit: vi.fn().mockResolvedValue({ allowed: true }) };
  const service = new WorkspacesService({ client: full } as unknown as PrismaService, { log: vi.fn() } as unknown as AuditService, usage as unknown as UsageService, { attribute: vi.fn() } as unknown as ReferralsService);
  return { service, client: full, tx };
}

describe("WorkspacesService.updateMemberRole", () => {
  it("only finds members of the workspace in the URL, so another workspace's membership id is not found", async () => {
    const { service, client } = make({ membership: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() } });
    await expect(service.updateMemberRole("ws1", "someone-elses", "u-actor", { role: "viewer" })).rejects.toThrow(NotFoundException);
    expect(client.membership.findFirst).toHaveBeenCalledWith({ where: { id: "someone-elses", workspaceId: "ws1" } });
    expect(client.membership.update).not.toHaveBeenCalled();
  });

  it("lets an admin change an ordinary member's role", async () => {
    const { service, client } = make();
    await service.updateMemberRole("ws1", "m-target", "u-actor", { role: "manager" });
    expect(client.membership.update).toHaveBeenCalledWith({ where: { id: "m-target" }, data: { role: "manager" } });
  });

  it("stops an admin promoting themselves to owner", async () => {
    const { service, client } = make({ membership: { findFirst: vi.fn().mockResolvedValue({ id: "m-actor", userId: "u-actor", role: "admin" }), findUnique: vi.fn().mockResolvedValue({ role: "admin" }), count: vi.fn().mockResolvedValue(1), update: vi.fn() } });
    await expect(service.updateMemberRole("ws1", "m-actor", "u-actor", { role: "owner" })).rejects.toThrow(ForbiddenException);
    expect(client.membership.update).not.toHaveBeenCalled();
  });

  it("stops an admin promoting someone else to owner, or demoting an owner", async () => {
    const { service } = make();
    await expect(service.updateMemberRole("ws1", "m-target", "u-actor", { role: "owner" })).rejects.toThrow("Only an owner");

    const ownerTarget = make({ membership: { findFirst: vi.fn().mockResolvedValue({ id: "m-owner", userId: "u-owner", role: "owner" }), findUnique: vi.fn().mockResolvedValue({ role: "admin" }), count: vi.fn().mockResolvedValue(2), update: vi.fn() } });
    await expect(ownerTarget.service.updateMemberRole("ws1", "m-owner", "u-actor", { role: "viewer" })).rejects.toThrow(ForbiddenException);
  });

  it("lets an owner hand over ownership but never remove the last owner", async () => {
    const owner = { findUnique: vi.fn().mockResolvedValue({ role: "owner" }) };
    const grant = make({ membership: { findFirst: vi.fn().mockResolvedValue({ id: "m-target", userId: "u-target", role: "admin" }), ...owner, count: vi.fn().mockResolvedValue(1), update: vi.fn() } });
    await grant.service.updateMemberRole("ws1", "m-target", "u-actor", { role: "owner" });
    expect(grant.client.membership.update).toHaveBeenCalled();

    const last = make({ membership: { findFirst: vi.fn().mockResolvedValue({ id: "m-actor", userId: "u-actor", role: "owner" }), ...owner, count: vi.fn().mockResolvedValue(1), update: vi.fn() } });
    await expect(last.service.updateMemberRole("ws1", "m-actor", "u-actor", { role: "admin" })).rejects.toThrow(ForbiddenException);
  });
});

describe("WorkspacesService.invite", () => {
  it("only an owner can invite another owner; an admin can invite the rest", async () => {
    const admin = make();
    await expect(admin.service.invite("ws1", "u-actor", { email: "a@b.co", role: "owner" })).rejects.toThrow("Only an owner");
    await admin.service.invite("ws1", "u-actor", { email: "A@B.co", role: "admin" });
    expect((admin.client.invite.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data.email).toBe("a@b.co"); // normalised

    const owner = make({ membership: { findUnique: vi.fn().mockResolvedValue({ role: "owner" }) } });
    await owner.service.invite("ws1", "u-actor", { email: "a@b.co", role: "owner" });
    expect(owner.client.invite.create).toHaveBeenCalled();
  });

  it("refuses people who are not members, or whose role can't invite", async () => {
    const stranger = make({ membership: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(stranger.service.invite("ws1", "u-x", { email: "a@b.co", role: "sales" })).rejects.toThrow(ForbiddenException);
    const sales = make({ membership: { findUnique: vi.fn().mockResolvedValue({ role: "sales" }) } });
    await expect(sales.service.invite("ws1", "u-x", { email: "a@b.co", role: "viewer" })).rejects.toThrow(ForbiddenException);
  });
});

describe("WorkspacesService.acceptInvite", () => {
  const pending = { id: "inv1", workspaceId: "ws1", email: "Invited@Example.com", role: "admin", status: "pending", expiresAt: new Date(Date.now() + 60_000), teamId: null };

  it("only works for the email address the invite was sent to", async () => {
    const { service, tx } = make({ invite: { findUnique: vi.fn().mockResolvedValue(pending) }, user: { findUnique: vi.fn().mockResolvedValue({ email: "someone-who-got-the-link@example.com" }) } });
    await expect(service.acceptInvite("token", "u9")).rejects.toThrow("different email address");
    expect(tx.membership.create).not.toHaveBeenCalled();
  });

  it("accepts for the right person, ignoring email case", async () => {
    const { service, tx } = make({
      invite: { findUnique: vi.fn().mockResolvedValue(pending) },
      user: { findUnique: vi.fn().mockResolvedValue({ email: "invited@example.com" }) },
      membership: { findUnique: vi.fn().mockResolvedValue(null) }
    });
    await service.acceptInvite("token", "u9");
    expect(tx.membership.create).toHaveBeenCalledWith({ data: { workspaceId: "ws1", userId: "u9", role: "admin", teamId: null } });
  });

  it("tells someone who is already a member instead of failing with a database error", async () => {
    const { service } = make({
      invite: { findUnique: vi.fn().mockResolvedValue(pending) },
      user: { findUnique: vi.fn().mockResolvedValue({ email: "invited@example.com" }) },
      membership: { findUnique: vi.fn().mockResolvedValue({ id: "existing" }) }
    });
    await expect(service.acceptInvite("token", "u9")).rejects.toThrow(ConflictException);
  });

  it("rejects used or expired invites", async () => {
    const used = make({ invite: { findUnique: vi.fn().mockResolvedValue({ ...pending, status: "accepted" }) } });
    await expect(used.service.acceptInvite("token", "u9")).rejects.toThrow(ForbiddenException);
    const expired = make({ invite: { findUnique: vi.fn().mockResolvedValue({ ...pending, expiresAt: new Date(Date.now() - 1000) }) } });
    await expect(expired.service.acceptInvite("token", "u9")).rejects.toThrow(ForbiddenException);
  });
});

describe("WorkspacesService.create trial", () => {
  const dto = { name: "Clinic", mode: "business", industry: "clinic" } as never;

  it("gives a person's first workspace a 14-day Growth trial", async () => {
    const { service, client } = make({ membership: { count: vi.fn().mockResolvedValue(0) } });
    await service.create("u1", dto);
    const data = (client.workspace.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data;
    expect(data.planId).toBe("growth");
    expect(data.subscription.create).toMatchObject({ planId: "growth", status: "trialing" });
    const days = (data.subscription.create.trialEndsAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
  });

  it("gives later workspaces no trial", async () => {
    const { service, client } = make({ membership: { count: vi.fn().mockResolvedValue(1) } });
    await service.create("u1", dto);
    const data = (client.workspace.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data;
    expect(data.planId).toBeUndefined();
    expect(data.subscription).toBeUndefined();
  });
});
