import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import {
  createWorkspaceSchema,
  inviteMemberSchema,
  updateMemberRoleSchema
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
}
