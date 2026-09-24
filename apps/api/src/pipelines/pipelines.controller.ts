import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import {
  createPipelineSchema,
  createStageSchema,
  reorderStagesSchema,
  updatePipelineSchema,
  updateStageSchema
} from "./dto/pipelines.dto";
import { PipelinesService } from "./pipelines.service";

@Controller("pipelines/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("leads.read")
export class PipelinesController {
  constructor(private readonly pipelines: PipelinesService) {}

  @Get()
  list(@Param("workspaceId") workspaceId: string) {
    return this.pipelines.list(workspaceId);
  }

  @Post()
  @RequirePermission("pipelines.manage")
  create(
    @Param("workspaceId") workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createPipelineSchema)) body: unknown
  ) {
    return this.pipelines.create(workspaceId, userId, body as never);
  }

  @Get(":pipelineId/board")
  board(@Param("workspaceId") workspaceId: string, @Param("pipelineId") pipelineId: string) {
    return this.pipelines.getBoard(workspaceId, pipelineId);
  }

  @Patch(":pipelineId")
  @RequirePermission("pipelines.manage")
  update(
    @Param("workspaceId") workspaceId: string,
    @Param("pipelineId") pipelineId: string,
    @Body(new ZodValidationPipe(updatePipelineSchema)) body: unknown
  ) {
    return this.pipelines.update(workspaceId, pipelineId, body as never);
  }

  @Delete(":pipelineId")
  @RequirePermission("pipelines.manage")
  remove(@Param("workspaceId") workspaceId: string, @Param("pipelineId") pipelineId: string) {
    return this.pipelines.remove(workspaceId, pipelineId);
  }

  @Post(":pipelineId/stages")
  @RequirePermission("pipelines.manage")
  addStage(
    @Param("workspaceId") workspaceId: string,
    @Param("pipelineId") pipelineId: string,
    @Body(new ZodValidationPipe(createStageSchema)) body: unknown
  ) {
    return this.pipelines.addStage(workspaceId, pipelineId, body as never);
  }

  @Patch(":pipelineId/stages/reorder")
  @RequirePermission("pipelines.manage")
  reorderStages(
    @Param("workspaceId") workspaceId: string,
    @Param("pipelineId") pipelineId: string,
    @Body(new ZodValidationPipe(reorderStagesSchema)) body: unknown
  ) {
    return this.pipelines.reorderStages(workspaceId, pipelineId, body as never);
  }

  @Patch(":pipelineId/stages/:stageId")
  @RequirePermission("pipelines.manage")
  updateStage(
    @Param("workspaceId") workspaceId: string,
    @Param("pipelineId") pipelineId: string,
    @Param("stageId") stageId: string,
    @Body(new ZodValidationPipe(updateStageSchema)) body: unknown
  ) {
    return this.pipelines.updateStage(workspaceId, pipelineId, stageId, body as never);
  }

  @Delete(":pipelineId/stages/:stageId")
  @RequirePermission("pipelines.manage")
  removeStage(
    @Param("workspaceId") workspaceId: string,
    @Param("pipelineId") pipelineId: string,
    @Param("stageId") stageId: string
  ) {
    return this.pipelines.removeStage(workspaceId, pipelineId, stageId);
  }
}
