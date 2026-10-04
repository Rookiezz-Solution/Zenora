import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { DashboardService } from "./dashboard.service";

const querySchema = z.object({ days: z.coerce.number().int().refine((n) => n === 7 || n === 30, "days must be 7 or 30").default(7) });

@Controller("dashboard/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("reports.read")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  summary(@Param("workspaceId") workspaceId: string, @Query(new ZodValidationPipe(querySchema)) query: unknown) {
    return this.dashboard.summary(workspaceId, (query as { days: number }).days);
  }
}
