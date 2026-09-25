import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { createWaTemplateSchema, listWaTemplatesQuerySchema, updateWaTemplateSchema } from "./dto/wa-template.dto";
import { TemplatesService } from "./templates.service";

// WhatsApp template builder + Meta approval sync (docs/ROADMAP.md Phase 1
// item 7). The inbox composer's "approved only" read still works the same
// way it did in Phase 1 item 2 — that's the default `scope`.
@Controller("workspaces/:workspaceId/templates")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("leads.read")
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@Param("workspaceId") workspaceId: string, @Query(new ZodValidationPipe(listWaTemplatesQuerySchema)) query: unknown) {
    return this.templates.list(workspaceId, query as never);
  }

  @Post()
  @RequirePermission("broadcasts.send")
  create(
    @Param("workspaceId") workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createWaTemplateSchema)) body: unknown
  ) {
    return this.templates.create(workspaceId, userId, body as never);
  }

  @Get(":id")
  getById(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.templates.getById(workspaceId, id);
  }

  @Patch(":id")
  @RequirePermission("broadcasts.send")
  update(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(updateWaTemplateSchema)) body: unknown
  ) {
    return this.templates.update(workspaceId, id, userId, body as never);
  }

  @Delete(":id")
  @RequirePermission("broadcasts.send")
  remove(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @CurrentUser() userId: string) {
    return this.templates.remove(workspaceId, id, userId);
  }

  @Post(":id/submit")
  @RequirePermission("broadcasts.send")
  submit(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @CurrentUser() userId: string) {
    return this.templates.submit(workspaceId, id, userId);
  }

  @Post(":id/sync")
  @RequirePermission("broadcasts.send")
  sync(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @CurrentUser() userId: string) {
    return this.templates.sync(workspaceId, id, userId);
  }
}
