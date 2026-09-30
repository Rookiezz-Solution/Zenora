import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { ReportsService } from "./reports.service";

@Controller("reports/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("reports.read")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("funnel")
  funnel(@Param("workspaceId") workspaceId: string, @Query("pipelineId") pipelineId?: string) {
    return this.reports.pipelineFunnel(workspaceId, pipelineId);
  }

  @Get("bot-dropoff")
  botDropoff(@Param("workspaceId") workspaceId: string) {
    return this.reports.botDropoff(workspaceId);
  }

  @Get("team-performance")
  teamPerformance(@Param("workspaceId") workspaceId: string) {
    return this.reports.teamPerformance(workspaceId);
  }

  @Get("lost-reasons")
  lostReasons(@Param("workspaceId") workspaceId: string) {
    return this.reports.lostReasons(workspaceId);
  }
}
