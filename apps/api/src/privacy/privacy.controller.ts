import { Body, Controller, Delete, Get, Header, Param, Post, Put, UseGuards } from "@nestjs/common";
import { MESSAGE_RETENTION_OPTIONS_DAYS } from "@zenora/shared";
import { z } from "zod";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { PrivacyService } from "./privacy.service";

const retentionSchema = z.object({ messageRetentionDays: z.union([z.null(), z.number().int()]) });
// Erasing someone is irreversible, so the caller must say so explicitly.
const deleteWorkspaceSchema = z.object({ confirmName: z.string().min(1).max(200) });
const eraseSchema = z.object({ confirm: z.literal(true) });

// Owners and admins only: exporting or erasing a person's data is as sensitive
// as it gets.
@Controller("privacy/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("settings.manage")
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  // Owner only (workspace.manage): this removes the whole business's data.
  @Get("deletion")
  deletion(@Param("workspaceId") workspaceId: string) {
    return this.privacy.deletionStatus(workspaceId);
  }

  @Post("deletion")
  @RequirePermission("workspace.manage")
  scheduleDeletion(@Param("workspaceId") workspaceId: string, @CurrentUser() userId: string, @Body(new ZodValidationPipe(deleteWorkspaceSchema)) body: unknown) {
    return this.privacy.scheduleDeletion(workspaceId, userId, (body as z.infer<typeof deleteWorkspaceSchema>).confirmName);
  }

  @Delete("deletion")
  @RequirePermission("workspace.manage")
  cancelDeletion(@Param("workspaceId") workspaceId: string, @CurrentUser() userId: string) {
    return this.privacy.cancelDeletion(workspaceId, userId);
  }

  @Get("retention")
  async retention(@Param("workspaceId") workspaceId: string) {
    return { ...(await this.privacy.getRetention(workspaceId)), options: MESSAGE_RETENTION_OPTIONS_DAYS };
  }

  @Put("retention")
  setRetention(@Param("workspaceId") workspaceId: string, @CurrentUser() userId: string, @Body(new ZodValidationPipe(retentionSchema)) body: unknown) {
    return this.privacy.setRetention(workspaceId, userId, (body as z.infer<typeof retentionSchema>).messageRetentionDays);
  }

  @Get("leads/:leadId/export")
  @Header("Cache-Control", "no-store")
  exportLead(@Param("workspaceId") workspaceId: string, @Param("leadId") leadId: string, @CurrentUser() userId: string) {
    return this.privacy.exportLead(workspaceId, leadId, userId);
  }

  @Post("leads/:leadId/erase")
  eraseLead(@Param("workspaceId") workspaceId: string, @Param("leadId") leadId: string, @CurrentUser() userId: string, @Body(new ZodValidationPipe(eraseSchema)) _body: unknown) {
    return this.privacy.eraseLead(workspaceId, leadId, userId);
  }
}
