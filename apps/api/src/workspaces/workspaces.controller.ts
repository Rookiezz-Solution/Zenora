import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RateLimiter } from "../common/rate-limiter";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import {
  createWorkspaceSchema,
  inviteMemberSchema,
  updateMemberAvailabilitySchema,
  updateMemberRoleSchema,
  updateWorkspaceSettingsSchema
} from "./dto/workspaces.dto";
import { WorkspacesService } from "./workspaces.service";

@Controller("workspaces")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  create(@CurrentUser() userId: string, @Body(new ZodValidationPipe(createWorkspaceSchema)) body: unknown) {
    return this.workspaces.create(userId, body as never);
  }

  @Get()
  listMine(@CurrentUser() userId: string) {
    return this.workspaces.listMine(userId);
  }

  @Get(":workspaceId")
  async getById(@Param("workspaceId") workspaceId: string, @CurrentUser() userId: string) {
    await this.workspaces.ensureMember(workspaceId, userId);
    return this.workspaces.getById(workspaceId);
  }

  @Patch(":workspaceId")
  @RequirePermission("settings.manage")
  updateSettings(
    @Param("workspaceId") workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(updateWorkspaceSettingsSchema)) body: unknown
  ) {
    return this.workspaces.updateSettings(workspaceId, userId, body as never);
  }

  @Get(":workspaceId/members")
  async listMembers(@Param("workspaceId") workspaceId: string, @CurrentUser() userId: string) {
    await this.workspaces.ensureMember(workspaceId, userId);
    return this.workspaces.listMembers(workspaceId);
  }

  @Post(":workspaceId/invites")
  @RequirePermission("members.manage")
  invite(
    @Param("workspaceId") workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(inviteMemberSchema)) body: unknown
  ) {
    return this.workspaces.invite(workspaceId, userId, body as never);
  }

  @Get(":workspaceId/invites")
  @RequirePermission("members.manage")
  listInvites(@Param("workspaceId") workspaceId: string) {
    return this.workspaces.listInvites(workspaceId);
  }

  @Delete(":workspaceId/invites/:inviteId")
  @RequirePermission("members.manage")
  revokeInvite(@Param("workspaceId") workspaceId: string, @Param("inviteId") inviteId: string, @CurrentUser() userId: string) {
    return this.workspaces.revokeInvite(workspaceId, inviteId, userId);
  }

  @Delete(":workspaceId/members/:membershipId")
  @RequirePermission("members.manage")
  removeMember(@Param("workspaceId") workspaceId: string, @Param("membershipId") membershipId: string, @CurrentUser() userId: string) {
    return this.workspaces.removeMember(workspaceId, membershipId, userId);
  }

  @Post("invites/:token/accept")
  acceptInvite(@Param("token") token: string, @CurrentUser() userId: string) {
    return this.workspaces.acceptInvite(token, userId);
  }

  @Patch(":workspaceId/members/:membershipId")
  @RequirePermission("members.manage")
  updateRole(
    @Param("workspaceId") workspaceId: string,
    @Param("membershipId") membershipId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(updateMemberRoleSchema)) body: unknown
  ) {
    return this.workspaces.updateMemberRole(workspaceId, membershipId, userId, body as never);
  }

  // Team availability toggle feeding routing's least-busy/round-robin
  // fallback (docs/PRD.md section 10). Gated with routing rather than
  // members.manage since it's part of the routing settings surface.
  @Patch(":workspaceId/members/:membershipId/availability")
  @RequirePermission("routing.manage")
  updateAvailability(
    @Param("workspaceId") workspaceId: string,
    @Param("membershipId") membershipId: string,
    @Body(new ZodValidationPipe(updateMemberAvailabilitySchema)) body: unknown
  ) {
    return this.workspaces.updateMemberAvailability(workspaceId, membershipId, body as never);
  }
}

const inviteInfoLimiter = new RateLimiter(60, 10 * 60_000, "invite-info");

// Unauthenticated on purpose: what the invite page shows before the person has
// signed in or created an account.
@Controller("public/invites")
export class PublicInviteController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get(":token")
  async info(@Param("token") token: string, @Req() req: Request) {
    await inviteInfoLimiter.consume(req.ip ?? "unknown");
    return this.workspaces.inviteInfo(token);
  }
}
