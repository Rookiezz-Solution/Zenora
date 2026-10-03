import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { AuditService } from "../audit/audit.service";
import { ApiKeysService } from "./api-keys.service";
import {
  createApiKeySchema,
  createWebhookSchema,
  updateWebhookSchema,
  type CreateApiKeyDto,
  type CreateWebhookDto,
  type UpdateWebhookDto
} from "./developers.dto";
import { WebhooksService } from "./webhooks.service";

// Owner-facing management of API keys and webhook endpoints. Keys and signing
// secrets control access to the whole workspace's data, hence settings.manage.
@Controller("developers/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("settings.manage")
export class DevelopersController {
  constructor(
    private readonly keys: ApiKeysService,
    private readonly webhooks: WebhooksService,
    private readonly audit: AuditService
  ) {}

  @Get("api-keys")
  listKeys(@Param("workspaceId") workspaceId: string) {
    return this.keys.list(workspaceId);
  }

  @Post("api-keys")
  async createKey(@Param("workspaceId") workspaceId: string, @CurrentUser() userId: string, @Body(new ZodValidationPipe(createApiKeySchema)) body: unknown) {
    const created = await this.keys.create(workspaceId, userId, body as CreateApiKeyDto);
    await this.audit.log({ workspaceId, userId, action: "api_key.created", entityType: "api_key", entityId: created.id, metadata: { name: created.name, scopes: created.scopes } });
    return created;
  }

  @Delete("api-keys/:id")
  async revokeKey(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @CurrentUser() userId: string) {
    const result = await this.keys.revoke(workspaceId, id);
    await this.audit.log({ workspaceId, userId, action: "api_key.revoked", entityType: "api_key", entityId: id });
    return result;
  }

  @Get("webhooks")
  listWebhooks(@Param("workspaceId") workspaceId: string) {
    return this.webhooks.list(workspaceId);
  }

  @Post("webhooks")
  async createWebhook(@Param("workspaceId") workspaceId: string, @CurrentUser() userId: string, @Body(new ZodValidationPipe(createWebhookSchema)) body: unknown) {
    const created = await this.webhooks.create(workspaceId, body as CreateWebhookDto);
    await this.audit.log({ workspaceId, userId, action: "webhook.created", entityType: "webhook", entityId: created.id, metadata: { url: created.url, events: created.events } });
    return created;
  }

  @Patch("webhooks/:id")
  updateWebhook(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @Body(new ZodValidationPipe(updateWebhookSchema)) body: unknown) {
    return this.webhooks.update(workspaceId, id, body as UpdateWebhookDto);
  }

  @Delete("webhooks/:id")
  async removeWebhook(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @CurrentUser() userId: string) {
    const result = await this.webhooks.remove(workspaceId, id);
    await this.audit.log({ workspaceId, userId, action: "webhook.deleted", entityType: "webhook", entityId: id });
    return result;
  }

  @Post("webhooks/:id/test")
  testWebhook(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.webhooks.sendTest(workspaceId, id);
  }

  @Get("webhooks/:id/deliveries")
  deliveries(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.webhooks.deliveries(workspaceId, id);
  }
}
