import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import {
  createFlowTemplateSchema,
  listFlowTemplatesQuerySchema,
  updateFlowTemplateSchema,
  useFlowTemplateSchema
} from "./dto/flow-templates.dto";
import { FlowTemplatesService } from "./flow-templates.service";

@Controller("flow-templates/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("automations.manage")
export class FlowTemplatesController {
  constructor(private readonly templates: FlowTemplatesService) {}

  @Get()
  list(@Param("workspaceId") workspaceId: string, @Query(new ZodValidationPipe(listFlowTemplatesQuerySchema)) query: unknown) {
    return this.templates.list(workspaceId, query as never);
  }

  @Post()
  create(
    @Param("workspaceId") workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createFlowTemplateSchema)) body: unknown
  ) {
    return this.templates.create(workspaceId, userId, body as never);
  }

  @Get(":id")
  getById(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.templates.getById(workspaceId, id);
  }

  @Patch(":id")
  update(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(updateFlowTemplateSchema)) body: unknown
  ) {
    return this.templates.update(workspaceId, id, userId, body as never);
  }

  @Delete(":id")
  remove(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @CurrentUser() userId: string) {
    return this.templates.remove(workspaceId, id, userId);
  }

  @Post(":id/use")
  use(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(useFlowTemplateSchema)) body: unknown
  ) {
    return this.templates.use(workspaceId, id, userId, body as never);
  }
}
