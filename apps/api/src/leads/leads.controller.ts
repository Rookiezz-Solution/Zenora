import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import {
  addNoteSchema,
  addTagSchema,
  createLeadSchema,
  importLeadsSchema,
  listLeadsQuerySchema,
  mergeLeadsSchema,
  updateLeadSchema
} from "./dto/leads.dto";
import { LeadsService } from "./leads.service";

@Controller("leads/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("leads.read")
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  list(@Param("workspaceId") workspaceId: string, @Query(new ZodValidationPipe(listLeadsQuerySchema)) query: unknown) {
    return this.leads.list(workspaceId, query as never);
  }

  @Post()
  @RequirePermission("leads.write")
  create(
    @Param("workspaceId") workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createLeadSchema)) body: unknown
  ) {
    return this.leads.create(workspaceId, userId, body as never);
  }

  @Post("import")
  @RequirePermission("leads.write")
  import(
    @Param("workspaceId") workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(importLeadsSchema)) body: unknown
  ) {
    return this.leads.import(workspaceId, userId, body as never);
  }

  @Post("merge")
  @RequirePermission("leads.write")
  merge(
    @Param("workspaceId") workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(mergeLeadsSchema)) body: unknown
  ) {
    return this.leads.merge(workspaceId, userId, body as never);
  }

  @Get(":leadId")
  getById(@Param("workspaceId") workspaceId: string, @Param("leadId") leadId: string) {
    return this.leads.getById(workspaceId, leadId);
  }

  @Patch(":leadId")
  @RequirePermission("leads.write")
  update(
    @Param("workspaceId") workspaceId: string,
    @Param("leadId") leadId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(updateLeadSchema)) body: unknown
  ) {
    return this.leads.update(workspaceId, leadId, userId, body as never);
  }

  @Delete(":leadId")
  @RequirePermission("leads.delete")
  remove(@Param("workspaceId") workspaceId: string, @Param("leadId") leadId: string, @CurrentUser() userId: string) {
    return this.leads.remove(workspaceId, leadId, userId);
  }

  @Get(":leadId/timeline")
  timeline(@Param("workspaceId") workspaceId: string, @Param("leadId") leadId: string) {
    return this.leads.getTimeline(workspaceId, leadId);
  }

  @Get(":leadId/duplicates")
  duplicates(@Param("workspaceId") workspaceId: string, @Param("leadId") leadId: string) {
    return this.leads.findDuplicates(workspaceId, leadId);
  }

  @Post(":leadId/tags")
  @RequirePermission("leads.write")
  addTag(
    @Param("workspaceId") workspaceId: string,
    @Param("leadId") leadId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(addTagSchema)) body: unknown
  ) {
    return this.leads.addTag(workspaceId, leadId, userId, body as never);
  }

  @Delete(":leadId/tags/:tagId")
  @RequirePermission("leads.write")
  removeTag(@Param("workspaceId") workspaceId: string, @Param("leadId") leadId: string, @Param("tagId") tagId: string) {
    return this.leads.removeTag(workspaceId, leadId, tagId);
  }

  @Post(":leadId/notes")
  @RequirePermission("leads.write")
  addNote(
    @Param("workspaceId") workspaceId: string,
    @Param("leadId") leadId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(addNoteSchema)) body: unknown
  ) {
    return this.leads.addNote(workspaceId, leadId, userId, body as never);
  }
}
