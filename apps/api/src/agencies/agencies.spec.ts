import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import { AgenciesService } from "./agencies.service";

function make(client: Record<string, unknown> = {}) {
  const full = {
    agency: { create: vi.fn().mockResolvedValue({ id: "ag1" }) },
    agencyMember: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue({ id: "am1", role: "owner" }),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      delete: vi.fn()
    },
    user: { findUnique: vi.fn().mockResolvedValue({ id: "u2" }) },
    workspace: {
      create: vi.fn().mockResolvedValue({ id: "ws1" }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: "ws1" }),
      findUnique: vi.fn().mockResolvedValue({ agencyId: "ag1", agency: { id: "ag1", name: "Agency" } }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ agencyId: null }),
      update: vi.fn()
    },
    membership: { findFirst: vi.fn().mockResolvedValue({ id: "m1" }), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    lead: { groupBy: vi.fn().mockResolvedValue([]) },
    task: { groupBy: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    ...client
  };
  const audit = { log: vi.fn() };
  return { service: new AgenciesService({ client: full } as unknown as PrismaService, audit as unknown as AuditService), client: full, audit };
}

const asAdmin = { agencyMember: { findUnique: vi.fn().mockResolvedValue({ id: "am1", role: "admin" }), findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), delete: vi.fn() } };
const asStranger = { agencyMember: { findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), delete: vi.fn() } };

describe("AgenciesService.create", () => {
  it("makes the caller the agency owner, once", async () => {
    const { service, client } = make();
    await service.create("u1", { name: "Pixel Agency" });
    expect((client.agency.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data).toMatchObject({ name: "Pixel Agency", members: { create: { userId: "u1", role: "owner" } } });

    const dup = make({ agencyMember: { findFirst: vi.fn().mockResolvedValue({ id: "x" }) } });
    await expect(dup.service.create("u1", { name: "Second" })).rejects.toThrow(ConflictException);
  });
});

describe("AgenciesService team", () => {
  it("only the owner can add or remove people, and strangers are refused", async () => {
    await expect(make(asAdmin).service.addMember("u2", "ag1", { email: "a@b.co" })).rejects.toThrow("Only the agency owner");
    await expect(make(asStranger).service.addMember("u9", "ag1", { email: "a@b.co" })).rejects.toThrow(ForbiddenException);
    await expect(make(asAdmin).service.removeMember("u2", "ag1", "u3")).rejects.toThrow("Only the agency owner");
  });

  it("needs an existing Zenora account, and gives a new member admin access to every existing client", async () => {
    const missing = make({ user: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(missing.service.addMember("u1", "ag1", { email: "nobody@x.co" })).rejects.toThrow(NotFoundException);

    const { service, client } = make({
      agencyMember: { findUnique: vi.fn().mockResolvedValueOnce({ id: "am1", role: "owner" }).mockResolvedValueOnce(null).mockResolvedValue({ id: "am1", role: "owner" }), findFirst: vi.fn().mockResolvedValue({ agencyId: "ag1", role: "owner", agency: { id: "ag1", name: "A", members: [] } }), findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
      workspace: { findMany: vi.fn().mockResolvedValue([{ id: "c1" }, { id: "c2" }]) }
    });
    await service.addMember("u1", "ag1", { email: "staff@x.co" });

    expect((client.agencyMember.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data).toMatchObject({ role: "admin", userId: "u2" });
    const grants = (client.membership.create as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].data);
    expect(grants).toEqual([
      { workspaceId: "c1", userId: "u2", role: "admin", viaAgencyId: "ag1" },
      { workspaceId: "c2", userId: "u2", role: "admin", viaAgencyId: "ag1" }
    ]);
  });

  it("never overwrites access someone already has in a client workspace", async () => {
    const { service, client } = make({
      agencyMember: { findUnique: vi.fn().mockResolvedValueOnce({ id: "am1", role: "owner" }).mockResolvedValueOnce(null).mockResolvedValue({ id: "am1", role: "owner" }), findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
      workspace: { findMany: vi.fn().mockResolvedValue([{ id: "c1" }]) },
      membership: { findUnique: vi.fn().mockResolvedValue({ id: "own", role: "owner" }), create: vi.fn() }
    });
    await service.addMember("u1", "ag1", { email: "staff@x.co" });
    expect(client.membership.create).not.toHaveBeenCalled();
  });

  it("removing a member also removes the access that came through the agency, and not the owner", async () => {
    const { service, client } = make({
      agencyMember: { findUnique: vi.fn().mockResolvedValueOnce({ id: "am1", role: "owner" }).mockResolvedValueOnce({ id: "am2", role: "admin" }), findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), delete: vi.fn() }
    });
    await service.removeMember("u1", "ag1", "u2");
    expect(client.membership.deleteMany).toHaveBeenCalledWith({ where: { userId: "u2", viaAgencyId: "ag1" } });

    const owner = make({ agencyMember: { findUnique: vi.fn().mockResolvedValue({ id: "am1", role: "owner" }), findFirst: vi.fn(), findMany: vi.fn(), delete: vi.fn() } });
    await expect(owner.service.removeMember("u1", "ag1", "u1")).rejects.toThrow(BadRequestException);
  });
});

describe("AgenciesService clients", () => {
  it("creating a client makes the owner its owner via the agency and gives teammates admin", async () => {
    const { service, client } = make({ agencyMember: { findUnique: vi.fn().mockResolvedValue({ id: "am1", role: "owner" }), findMany: vi.fn().mockResolvedValue([{ userId: "u2" }]) } });
    await service.createClient("u1", "ag1", { name: "Asha Clinic", mode: "team" });

    expect((client.workspace.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data).toMatchObject({ agencyId: "ag1", memberships: { create: { userId: "u1", role: "owner", viaAgencyId: "ag1" } } });
    expect((client.membership.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data).toEqual({ workspaceId: "ws1", userId: "u2", role: "admin", viaAgencyId: "ag1" });
  });

  it("lists only workspaces the caller is a member of, with stats from grouped queries", async () => {
    const { service, client } = make({
      workspace: { findMany: vi.fn().mockResolvedValue([{ id: "c1", name: "Asha", industry: null, createdAt: new Date(), subscription: { planId: "growth" } }]) },
      lead: { groupBy: vi.fn().mockResolvedValueOnce([{ workspaceId: "c1", _count: { _all: 40 } }]).mockResolvedValueOnce([{ workspaceId: "c1", _count: { _all: 6 } }]) },
      task: { groupBy: vi.fn().mockResolvedValueOnce([{ workspaceId: "c1", _count: { _all: 9 } }]).mockResolvedValueOnce([{ workspaceId: "c1", _count: { _all: 2 } }]) }
    });
    const rows = await service.clients("u1", "ag1");

    expect((client.workspace.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where).toEqual({ agencyId: "ag1", memberships: { some: { userId: "u1" } } });
    expect(rows).toEqual([{ id: "c1", name: "Asha", industry: null, planId: "growth", leads: 40, newLeads7d: 6, openTasks: 9, overdueTasks: 2 }]);
  });

  it("only the workspace's own owner can link it, and not one already in an agency", async () => {
    const notOwner = make({ membership: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(notOwner.service.linkClient("u1", "ag1", { workspaceId: "ws9" })).rejects.toThrow("Only the workspace's owner");

    const taken = make({ workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ agencyId: "other" }) } });
    await expect(taken.service.linkClient("u1", "ag1", { workspaceId: "ws1" })).rejects.toThrow("another agency");

    const { service, client, audit } = make({ agencyMember: { findUnique: vi.fn().mockResolvedValue({ id: "am1", role: "owner" }), findMany: vi.fn().mockResolvedValue([{ userId: "u2" }]) } });
    await service.linkClient("u1", "ag1", { workspaceId: "ws1" });
    expect(client.workspace.update).toHaveBeenCalledWith({ where: { id: "ws1" }, data: { agencyId: "ag1" } });
    expect((client.membership.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data).toMatchObject({ userId: "u2", role: "admin", viaAgencyId: "ag1" });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "agency.linked" }));
  });
});

describe("AgenciesService unlinking and revoking", () => {
  it("removes every membership that exists via the agency and detaches the workspace", async () => {
    const { service, client } = make();
    await service.unlinkClient("u1", "ag1", "ws1");
    expect(client.membership.deleteMany).toHaveBeenCalledWith({ where: { workspaceId: "ws1", viaAgencyId: "ag1" } });
    expect(client.workspace.update).toHaveBeenCalledWith({ where: { id: "ws1" }, data: { agencyId: null } });
  });

  it("refuses to unlink a workspace that has no owner of its own", async () => {
    const { service, client } = make({ membership: { findFirst: vi.fn().mockResolvedValue(null), deleteMany: vi.fn() } });
    await expect(service.unlinkClient("u1", "ag1", "ws1")).rejects.toThrow("no owner of its own");
    expect(client.membership.deleteMany).not.toHaveBeenCalled();
  });

  it("lets only the client's own owner revoke the agency, never someone there via the agency", async () => {
    const viaAgencyOnly = make({ membership: { findFirst: vi.fn().mockResolvedValue(null), deleteMany: vi.fn() } });
    await expect(viaAgencyOnly.service.revokeAgency("u1", "ws1")).rejects.toThrow(ForbiddenException);
    expect((viaAgencyOnly.client.membership.findFirst as ReturnType<typeof vi.fn>).mock.calls[0]![0].where).toMatchObject({ role: "owner", viaAgencyId: null, userId: "u1" });

    const ok = make();
    await ok.service.revokeAgency("owner1", "ws1");
    expect(ok.client.workspace.update).toHaveBeenCalledWith({ where: { id: "ws1" }, data: { agencyId: null } });

    const none = make({ workspace: { findUnique: vi.fn().mockResolvedValue({ agencyId: null }) } });
    await expect(none.service.revokeAgency("owner1", "ws1")).rejects.toThrow(NotFoundException);
  });
});
