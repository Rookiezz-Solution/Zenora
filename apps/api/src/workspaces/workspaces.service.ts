import { ForbiddenException, Injectable } from "@nestjs/common";
import * as crypto from "node:crypto";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateWorkspaceDto, InviteMemberDto, UpdateMemberRoleDto } from "./dto/workspaces.dto";

const INVITE_TTL_DAYS = 7;

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async create(userId: string, dto: CreateWorkspaceDto) {
    const workspace = await this.prisma.client.workspace.create({
      data: {
        name: dto.name,
        mode: dto.mode,
        industry: dto.industry,
        memberships: { create: { userId, role: "owner" } }
      }
    });
    await this.audit.log({
      workspaceId: workspace.id,
      userId,
      action: "workspace.created",
      entityType: "workspace",
      entityId: workspace.id
    });
    return workspace;
  }

  listMine(userId: string) {
    return this.prisma.client.workspace.findMany({
      where: { memberships: { some: { userId } } },
      orderBy: { createdAt: "asc" }
    });
  }

  async ensureMember(workspaceId: string, userId: string) {
    const membership = await this.prisma.client.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } }
    });
    if (!membership) {
      throw new ForbiddenException("Not a member of this workspace");
    }
    return membership;
  }

  async listMembers(workspaceId: string) {
    return this.prisma.client.membership.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } }
    });
  }

  async invite(workspaceId: string, invitedById: string, dto: InviteMemberDto) {
    const invite = await this.prisma.client.invite.create({
      data: {
        workspaceId,
        email: dto.email,
        role: dto.role,
        teamId: dto.teamId,
        invitedById,
        token: crypto.randomBytes(24).toString("hex"),
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000)
      }
    });
    await this.audit.log({
      workspaceId,
      userId: invitedById,
      action: "member.invited",
      entityType: "invite",
      entityId: invite.id,
      metadata: { email: dto.email, role: dto.role }
    });
    // TODO(Phase 1): send the invite email/WhatsApp message with invite.token.
    return invite;
  }

  async acceptInvite(token: string, userId: string) {
    const invite = await this.prisma.client.invite.findUnique({ where: { token } });
    if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
      throw new ForbiddenException("Invite is invalid or expired");
    }
    const membership = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.membership.create({
        data: { workspaceId: invite.workspaceId, userId, role: invite.role, teamId: invite.teamId }
      });
      await tx.invite.update({ where: { id: invite.id }, data: { status: "accepted" } });
      return created;
    });
    await this.audit.log({
      workspaceId: invite.workspaceId,
      userId,
      action: "member.joined",
      entityType: "membership",
      entityId: membership.id
    });
    return membership;
  }

  async updateMemberRole(workspaceId: string, membershipId: string, actingUserId: string, dto: UpdateMemberRoleDto) {
    const membership = await this.prisma.client.membership.update({
      where: { id: membershipId },
      data: { role: dto.role }
    });
    await this.audit.log({
      workspaceId,
      userId: actingUserId,
      action: "member.role_changed",
      entityType: "membership",
      entityId: membershipId,
      metadata: { role: dto.role }
    });
    return membership;
  }
}
