import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { clearMembershipCache } from "../auth/guards/permissions.guard";
import { PrismaService } from "../prisma/prisma.service";
import type { AddAgencyMemberDto, CreateAgencyDto, CreateClientDto, LinkClientDto } from "./agencies.dto";

const DAY_MS = 86_400_000;

// Agencies manage several client workspaces from one login. Access works
// through ordinary workspace memberships tagged `viaAgencyId`, so the existing
// permission system applies unchanged and everything the agency has can be
// found — and removed — in one place:
//  * the agency owner who creates a client becomes that workspace's owner;
//  * every other agency member gets the `admin` role (not owner: no billing,
//    no deleting the workspace);
//  * agency access never uses up the client's seats;
//  * the client's own owner can cut the agency off at any time.
@Injectable()
export class AgenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  // --- the agency itself ---------------------------------------------------

  async create(userId: string, dto: CreateAgencyDto) {
    const existing = await this.prisma.client.agencyMember.findFirst({ where: { userId, role: "owner" } });
    if (existing) throw new ConflictException("You already own an agency");
    return this.prisma.client.agency.create({ data: { name: dto.name, members: { create: { userId, role: "owner" } } } });
  }

  async mine(userId: string) {
    const member = await this.prisma.client.agencyMember.findFirst({
      where: { userId },
      include: { agency: { include: { members: { include: { user: { select: { id: true, email: true, name: true } } }, orderBy: { createdAt: "asc" } } } } }
    });
    if (!member) return null;
    return { id: member.agency.id, name: member.agency.name, role: member.role, members: member.agency.members.map((m) => ({ userId: m.userId, role: m.role, email: m.user.email, name: m.user.name })) };
  }

  async addMember(userId: string, agencyId: string, dto: AddAgencyMemberDto) {
    await this.requireOwner(userId, agencyId);
    const user = await this.prisma.client.user.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (!user) throw new NotFoundException("No Zenora account uses that email. Ask them to sign up first.");
    const already = await this.prisma.client.agencyMember.findUnique({ where: { agencyId_userId: { agencyId, userId: user.id } } });
    if (already) throw new ConflictException("They are already on your agency team");

    await this.prisma.client.agencyMember.create({ data: { agencyId, userId: user.id, role: "admin" } });
    const clients = await this.prisma.client.workspace.findMany({ where: { agencyId }, select: { id: true } });
    for (const c of clients) await this.grantAccess(c.id, agencyId, user.id, "admin");
    return this.mine(userId);
  }

  async removeMember(userId: string, agencyId: string, memberUserId: string) {
    await this.requireOwner(userId, agencyId);
    const target = await this.prisma.client.agencyMember.findUnique({ where: { agencyId_userId: { agencyId, userId: memberUserId } } });
    if (!target) throw new NotFoundException("Team member not found");
    if (target.role === "owner") throw new BadRequestException("The agency owner can't be removed");

    await this.prisma.client.$transaction([
      this.prisma.client.membership.deleteMany({ where: { userId: memberUserId, viaAgencyId: agencyId } }),
      this.prisma.client.agencyMember.delete({ where: { id: target.id } })
    ]);
    clearMembershipCache(); // removed access must stop working immediately
    return this.mine(userId);
  }

  // --- clients -------------------------------------------------------------

  // Only workspaces the caller can actually open — being on an agency's team
  // never reveals a workspace you have no membership in.
  async clients(userId: string, agencyId: string) {
    await this.requireMember(userId, agencyId);
    const workspaces = await this.prisma.client.workspace.findMany({
      where: { agencyId, memberships: { some: { userId } } },
      select: { id: true, name: true, industry: true, createdAt: true, subscription: { select: { planId: true } } },
      orderBy: { createdAt: "asc" }
    });
    const ids = workspaces.map((w) => w.id);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

    const [leads, newLeads, openTasks, overdueTasks] = await Promise.all([
      this.prisma.client.lead.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: ids }, mergedIntoId: null }, _count: { _all: true } }),
      this.prisma.client.lead.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: ids }, mergedIntoId: null, createdAt: { gte: weekAgo } }, _count: { _all: true } }),
      this.prisma.client.task.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: ids }, completedAt: null }, _count: { _all: true } }),
      this.prisma.client.task.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: ids }, completedAt: null, dueAt: { lt: now } }, _count: { _all: true } })
    ]);
    const countOf = (rows: { workspaceId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.workspaceId, r._count._all]));
    const [l, n, o, d] = [countOf(leads), countOf(newLeads), countOf(openTasks), countOf(overdueTasks)];

    return workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      industry: w.industry,
      planId: w.subscription?.planId ?? "free",
      leads: l.get(w.id) ?? 0,
      newLeads7d: n.get(w.id) ?? 0,
      openTasks: o.get(w.id) ?? 0,
      overdueTasks: d.get(w.id) ?? 0
    }));
  }

  async createClient(userId: string, agencyId: string, dto: CreateClientDto) {
    await this.requireOwner(userId, agencyId);
    const workspace = await this.prisma.client.workspace.create({
      data: { name: dto.name, mode: dto.mode, industry: dto.industry, agencyId, memberships: { create: { userId, role: "owner", viaAgencyId: agencyId } } }
    });
    const others = await this.prisma.client.agencyMember.findMany({ where: { agencyId, userId: { not: userId } } });
    for (const m of others) await this.grantAccess(workspace.id, agencyId, m.userId, "admin");
    await this.audit.log({ workspaceId: workspace.id, userId, action: "workspace.created_by_agency", entityType: "workspace", entityId: workspace.id, metadata: { agencyId } });
    return workspace;
  }

  // Bringing an existing workspace under the agency needs that workspace's own
  // owner to do it — an agency can't claim someone else's business.
  async linkClient(userId: string, agencyId: string, dto: LinkClientDto) {
    await this.requireOwner(userId, agencyId);
    const owner = await this.prisma.client.membership.findFirst({ where: { workspaceId: dto.workspaceId, userId, role: "owner", viaAgencyId: null } });
    if (!owner) throw new ForbiddenException("Only the workspace's owner can link it to an agency");
    const workspace = await this.prisma.client.workspace.findUniqueOrThrow({ where: { id: dto.workspaceId }, select: { agencyId: true } });
    if (workspace.agencyId) throw new ConflictException(workspace.agencyId === agencyId ? "Already linked to your agency" : "This workspace is already managed by another agency");

    await this.prisma.client.workspace.update({ where: { id: dto.workspaceId }, data: { agencyId } });
    const others = await this.prisma.client.agencyMember.findMany({ where: { agencyId, userId: { not: userId } } });
    for (const m of others) await this.grantAccess(dto.workspaceId, agencyId, m.userId, "admin");
    await this.audit.log({ workspaceId: dto.workspaceId, userId, action: "agency.linked", entityType: "workspace", entityId: dto.workspaceId, metadata: { agencyId } });
    return { ok: true };
  }

  // The agency walking away from a client.
  async unlinkClient(userId: string, agencyId: string, workspaceId: string) {
    await this.requireOwner(userId, agencyId);
    await this.detach(userId, agencyId, workspaceId);
    return { ok: true };
  }

  // --- the client's side ---------------------------------------------------

  // What the workspace owner sees: who is managing this workspace.
  async managedBy(userId: string, workspaceId: string) {
    await this.requireWorkspaceMember(userId, workspaceId);
    const workspace = await this.prisma.client.workspace.findUnique({ where: { id: workspaceId }, select: { agency: { select: { id: true, name: true } } } });
    if (!workspace?.agency) return { agency: null, people: [] };
    const people = await this.prisma.client.membership.findMany({ where: { workspaceId, viaAgencyId: workspace.agency.id }, include: { user: { select: { email: true, name: true } } } });
    return { agency: workspace.agency, people: people.map((p) => ({ email: p.user.email, name: p.user.name, role: p.role })) };
  }

  // The client's own owner removing the agency, and all its access, at will.
  async revokeAgency(userId: string, workspaceId: string) {
    const workspace = await this.prisma.client.workspace.findUnique({ where: { id: workspaceId }, select: { agencyId: true } });
    if (!workspace?.agencyId) throw new NotFoundException("No agency manages this workspace");
    const owner = await this.prisma.client.membership.findFirst({ where: { workspaceId, userId, role: "owner", viaAgencyId: null } });
    if (!owner) throw new ForbiddenException("Only the workspace's own owner can remove its agency");
    await this.detach(userId, workspace.agencyId, workspaceId);
    return { ok: true };
  }

  // --- internals -----------------------------------------------------------

  private async detach(actorId: string, agencyId: string, workspaceId: string) {
    const workspace = await this.prisma.client.workspace.findFirst({ where: { id: workspaceId, agencyId }, select: { id: true } });
    if (!workspace) throw new NotFoundException("Client not found");
    // Never leave a workspace with nobody in charge: someone who is not here
    // via the agency must own it.
    const remainingOwner = await this.prisma.client.membership.findFirst({ where: { workspaceId, role: "owner", viaAgencyId: null } });
    if (!remainingOwner) throw new ConflictException("This workspace has no owner of its own yet. Invite the client's owner first, then unlink.");

    await this.prisma.client.$transaction([
      this.prisma.client.membership.deleteMany({ where: { workspaceId, viaAgencyId: agencyId } }),
      this.prisma.client.workspace.update({ where: { id: workspaceId }, data: { agencyId: null } })
    ]);
    clearMembershipCache(); // the agency's access must stop working immediately
    await this.audit.log({ workspaceId, userId: actorId, action: "agency.unlinked", entityType: "workspace", entityId: workspaceId, metadata: { agencyId } });
  }

  // Adds agency access without ever touching access someone already has.
  private async grantAccess(workspaceId: string, agencyId: string, userId: string, role: "admin") {
    const existing = await this.prisma.client.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (existing) return;
    await this.prisma.client.membership.create({ data: { workspaceId, userId, role, viaAgencyId: agencyId } });
  }

  private async requireMember(userId: string, agencyId: string) {
    const member = await this.prisma.client.agencyMember.findUnique({ where: { agencyId_userId: { agencyId, userId } } });
    if (!member) throw new ForbiddenException("Not a member of this agency");
    return member;
  }

  private async requireOwner(userId: string, agencyId: string) {
    const member = await this.requireMember(userId, agencyId);
    if (member.role !== "owner") throw new ForbiddenException("Only the agency owner can do this");
  }

  private async requireWorkspaceMember(userId: string, workspaceId: string) {
    const m = await this.prisma.client.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!m) throw new ForbiddenException("Not a member of this workspace");
  }
}
