import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { BroadcastsService } from "./broadcasts.service";
import { createBroadcastSchema, estimateAudienceSchema, sendTestSchema } from "./dto/broadcasts.dto";

@Controller("broadcasts/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("broadcasts.send")
export class BroadcastsController {
  constructor(private readonly broadcasts: BroadcastsService) {}

  @Get()
  list(@Param("workspaceId") workspaceId: string) {
    return this.broadcasts.list(workspaceId);
  }

  @Post("estimate")
  estimate(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(estimateAudienceSchema)) body: unknown) {
    const { audienceFilter } = body as { audienceFilter: never };
    return this.broadcasts.estimateAudience(workspaceId, audienceFilter);
  }

  @Post()
  create(
    @Param("workspaceId") workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createBroadcastSchema)) body: unknown
  ) {
    return this.broadcasts.create(workspaceId, userId, body as never);
  }

  @Get(":id")
  getById(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.broadcasts.getById(workspaceId, id);
  }

  @Post(":id/test")
  sendTest(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(sendTestSchema)) body: unknown
  ) {
    return this.broadcasts.sendTest(workspaceId, id, userId, body as never);
  }

  @Post(":id/send")
  send(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @CurrentUser() userId: string) {
    return this.broadcasts.send(workspaceId, id, userId);
  }
}
