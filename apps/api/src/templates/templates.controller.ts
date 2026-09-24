import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { PrismaService } from "../prisma/prisma.service";

// Read-only for now — the WhatsApp template builder + Meta approval sync
// (docs/ROADMAP.md Phase 1 item 7) is what lets a business create templates.
// The inbox composer just needs to list already-approved ones to send
// outside the 24h window.
@Controller("workspaces/:workspaceId/templates")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("leads.read")
export class TemplatesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Param("workspaceId") workspaceId: string) {
    return this.prisma.client.waTemplate.findMany({
      where: { workspaceId, metaStatus: "approved" },
      orderBy: { name: "asc" }
    });
  }
}
