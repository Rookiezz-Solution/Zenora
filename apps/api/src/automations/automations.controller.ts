import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { saveAsTemplateSchema } from "../flow-templates/dto/flow-templates.dto";
import { AutomationsService } from "./automations.service";
import {
  createAutomationSchema,
  createSavedTriggerSchema,
  saveDraftSchema,
  setTriggerSchema,
  testRunSchema,
  updateAutomationSchema
} from "./dto/automations.dto";

@Controller("automations/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("automations.manage")
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get()
  list(@Param("workspaceId") workspaceId: string, @Query("status") status?: string) {
    return this.automations.list(workspaceId, status);
  }

  @Post()
  create(
    @Param("workspaceId") workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createAutomationSchema)) body: unknown
  ) {
    return this.automations.create(workspaceId, userId, body as never);
  }

  // Declared before ":id" so "saved-triggers" doesn't get swallowed as an id.
  @Get("saved-triggers")
  listSavedTriggers(@Param("workspaceId") workspaceId: string) {
    return this.automations.listSavedTriggers(workspaceId);
  }

  @Post("saved-triggers")
  createSavedTrigger(
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createSavedTriggerSchema)) body: unknown
  ) {
    return this.automations.createSavedTrigger(workspaceId, body as never);
  }

  @Delete("saved-triggers/:savedTriggerId")
  removeSavedTrigger(@Param("workspaceId") workspaceId: string, @Param("savedTriggerId") savedTriggerId: string) {
    return this.automations.removeSavedTrigger(workspaceId, savedTriggerId);
  }

  @Get(":id")
  getById(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.automations.getById(workspaceId, id);
  }

  @Patch(":id")
  update(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateAutomationSchema)) body: unknown
  ) {
    return this.automations.update(workspaceId, id, body as never);
  }

  @Post(":id/duplicate")
  duplicate(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @CurrentUser() userId: string) {
    return this.automations.duplicate(workspaceId, id, userId);
  }

  @Post(":id/save-as-template")
  saveAsTemplate(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(saveAsTemplateSchema)) body: unknown
  ) {
    return this.automations.saveAsTemplate(workspaceId, id, userId, body as never);
  }

  @Patch(":id/draft")
  saveDraft(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(saveDraftSchema)) body: unknown
  ) {
    return this.automations.saveDraft(workspaceId, id, body as never);
  }

  @Post(":id/trigger")
  setTrigger(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(setTriggerSchema)) body: unknown
  ) {
    return this.automations.setTrigger(workspaceId, id, userId, body as never);
  }

  @Post(":id/publish")
  publish(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @CurrentUser() userId: string) {
    return this.automations.publish(workspaceId, id, userId);
  }

  @Post(":id/pause")
  pause(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @CurrentUser() userId: string) {
    return this.automations.setStatus(workspaceId, id, userId, "paused");
  }

  @Post(":id/resume")
  resume(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @CurrentUser() userId: string) {
    return this.automations.setStatus(workspaceId, id, userId, "live");
  }

  @Get(":id/versions")
  versions(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.automations.versions(workspaceId, id);
  }

  @Post(":id/versions/:version/restore")
  restoreVersion(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Param("version", ParseIntPipe) version: number,
    @CurrentUser() userId: string
  ) {
    return this.automations.restoreVersion(workspaceId, id, version, userId);
  }

  @Get(":id/stats")
  stats(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.automations.stats(workspaceId, id);
  }

  @Post(":id/test")
  testRun(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(testRunSchema)) body: unknown
  ) {
    return this.automations.testRun(workspaceId, id, userId, body as never);
  }
}
