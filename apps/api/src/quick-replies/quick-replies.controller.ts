import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { createQuickReplySchema, updateQuickReplySchema } from "./dto/quick-reply.dto";
import { QuickRepliesService } from "./quick-replies.service";

@Controller("workspaces/:workspaceId/quick-replies")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("leads.read")
export class QuickRepliesController {
  constructor(private readonly quickReplies: QuickRepliesService) {}

  @Get()
  list(@Param("workspaceId") workspaceId: string) {
    return this.quickReplies.list(workspaceId);
  }

  @Post()
  @RequirePermission("settings.manage")
  create(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(createQuickReplySchema)) body: unknown) {
    return this.quickReplies.create(workspaceId, body as never);
  }

  @Patch(":id")
  @RequirePermission("settings.manage")
  update(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateQuickReplySchema)) body: unknown
  ) {
    return this.quickReplies.update(workspaceId, id, body as never);
  }

  @Delete(":id")
  @RequirePermission("settings.manage")
  remove(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.quickReplies.remove(workspaceId, id);
  }
}
