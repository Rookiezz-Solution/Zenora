import { Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { NotificationsService } from "./notifications.service";

@Controller("notifications/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("leads.read")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Param("workspaceId") workspaceId: string) {
    return this.notifications.list(workspaceId);
  }

  @Patch(":id/read")
  markRead(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.notifications.markRead(workspaceId, id);
  }
}
