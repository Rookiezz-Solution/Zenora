import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { CustomFieldsService } from "./custom-fields.service";
import { createCustomFieldSchema, updateCustomFieldSchema } from "./dto/custom-field.dto";

@Controller("workspaces/:workspaceId/custom-fields")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("leads.read")
export class CustomFieldsController {
  constructor(private readonly customFields: CustomFieldsService) {}

  @Get()
  list(@Param("workspaceId") workspaceId: string) {
    return this.customFields.list(workspaceId);
  }

  @Post()
  @RequirePermission("pipelines.manage")
  create(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(createCustomFieldSchema)) body: unknown) {
    return this.customFields.create(workspaceId, body as never);
  }

  @Patch(":id")
  @RequirePermission("pipelines.manage")
  update(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCustomFieldSchema)) body: unknown
  ) {
    return this.customFields.update(workspaceId, id, body as never);
  }

  @Delete(":id")
  @RequirePermission("pipelines.manage")
  remove(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.customFields.remove(workspaceId, id);
  }
}
