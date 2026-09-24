import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import {
  assignConversationSchema,
  handoverSchema,
  listConversationsQuerySchema,
  sendMessageSchema
} from "./dto/inbox.dto";
import { InboxService } from "./inbox.service";

@Controller("inbox/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("leads.read")
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get("conversations")
  listConversations(
    @Param("workspaceId") workspaceId: string,
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(listConversationsQuerySchema)) query: unknown
  ) {
    return this.inbox.listConversations(workspaceId, userId, query as never);
  }

  @Get("conversations/:conversationId/messages")
  getMessages(
    @Param("workspaceId") workspaceId: string,
    @Param("conversationId") conversationId: string,
    @Query("before") before?: string
  ) {
    return this.inbox.getMessages(workspaceId, conversationId, before);
  }

  @Post("conversations/:conversationId/messages")
  @RequirePermission("leads.write")
  sendMessage(
    @Param("workspaceId") workspaceId: string,
    @Param("conversationId") conversationId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: unknown
  ) {
    return this.inbox.sendMessage(workspaceId, conversationId, userId, body as never);
  }

  @Post("conversations/:conversationId/handover")
  @RequirePermission("leads.write")
  setHandover(
    @Param("workspaceId") workspaceId: string,
    @Param("conversationId") conversationId: string,
    @Body(new ZodValidationPipe(handoverSchema)) body: unknown
  ) {
    return this.inbox.setHandover(workspaceId, conversationId, body as never);
  }

  @Patch("conversations/:conversationId/assign")
  @RequirePermission("leads.write")
  assign(
    @Param("workspaceId") workspaceId: string,
    @Param("conversationId") conversationId: string,
    @Body(new ZodValidationPipe(assignConversationSchema)) body: unknown
  ) {
    return this.inbox.assign(workspaceId, conversationId, body as never);
  }
}
