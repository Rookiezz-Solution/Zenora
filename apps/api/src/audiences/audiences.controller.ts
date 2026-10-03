import { Controller, Get, Header, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { AudiencesService } from "./audiences.service";

const filterSchema = z.object({ tag: z.string().trim().min(1).max(60).optional() });

// Owners and admins only: a customer list is the most sensitive file Zenora can produce.
@Controller("audiences/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("settings.manage")
export class AudiencesController {
  constructor(private readonly audiences: AudiencesService) {}

  @Get("preview")
  preview(@Param("workspaceId") workspaceId: string, @Query(new ZodValidationPipe(filterSchema)) query: unknown) {
    return this.audiences.preview(workspaceId, query as z.infer<typeof filterSchema>);
  }

  @Post("export/meta")
  @Header("Cache-Control", "no-store")
  async exportForMeta(
    @Param("workspaceId") workspaceId: string,
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(filterSchema)) query: unknown,
    @Res() res: Response
  ) {
    const { csv } = await this.audiences.exportForMeta(workspaceId, userId, query as z.infer<typeof filterSchema>);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="zenora-meta-customer-list.csv"');
    res.send(csv);
  }
}
