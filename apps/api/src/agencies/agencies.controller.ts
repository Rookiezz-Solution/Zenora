import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import {
  addAgencyMemberSchema,
  createAgencySchema,
  createClientSchema,
  linkClientSchema,
  type AddAgencyMemberDto,
  type CreateAgencyDto,
  type CreateClientDto,
  type LinkClientDto
} from "./agencies.dto";
import { AgenciesService } from "./agencies.service";

// Authorisation is by agency/workspace role inside the service (these routes
// aren't scoped to a single workspace, so PermissionsGuard doesn't apply).
@Controller("agencies")
@UseGuards(JwtAuthGuard)
export class AgenciesController {
  constructor(private readonly agencies: AgenciesService) {}

  @Get("mine")
  mine(@CurrentUser() userId: string) {
    return this.agencies.mine(userId);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body(new ZodValidationPipe(createAgencySchema)) body: unknown) {
    return this.agencies.create(userId, body as CreateAgencyDto);
  }

  // Declared before the ":id" routes so "workspace" is never read as an id.
  @Get("workspace/:workspaceId")
  managedBy(@CurrentUser() userId: string, @Param("workspaceId") workspaceId: string) {
    return this.agencies.managedBy(userId, workspaceId);
  }

  @Delete("workspace/:workspaceId")
  revoke(@CurrentUser() userId: string, @Param("workspaceId") workspaceId: string) {
    return this.agencies.revokeAgency(userId, workspaceId);
  }

  @Get(":id/clients")
  clients(@CurrentUser() userId: string, @Param("id") id: string) {
    return this.agencies.clients(userId, id);
  }

  @Post(":id/clients")
  createClient(@CurrentUser() userId: string, @Param("id") id: string, @Body(new ZodValidationPipe(createClientSchema)) body: unknown) {
    return this.agencies.createClient(userId, id, body as CreateClientDto);
  }

  @Post(":id/clients/link")
  link(@CurrentUser() userId: string, @Param("id") id: string, @Body(new ZodValidationPipe(linkClientSchema)) body: unknown) {
    return this.agencies.linkClient(userId, id, body as LinkClientDto);
  }

  @Delete(":id/clients/:workspaceId")
  unlink(@CurrentUser() userId: string, @Param("id") id: string, @Param("workspaceId") workspaceId: string) {
    return this.agencies.unlinkClient(userId, id, workspaceId);
  }

  @Post(":id/members")
  addMember(@CurrentUser() userId: string, @Param("id") id: string, @Body(new ZodValidationPipe(addAgencyMemberSchema)) body: unknown) {
    return this.agencies.addMember(userId, id, body as AddAgencyMemberDto);
  }

  @Delete(":id/members/:userId")
  removeMember(@CurrentUser() userId: string, @Param("id") id: string, @Param("userId") memberUserId: string) {
    return this.agencies.removeMember(userId, id, memberUserId);
  }
}
