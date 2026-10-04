import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { SearchService } from "./search.service";

const querySchema = z.object({ q: z.string().max(100).default("") });

@Controller("search/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("leads.read")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  find(@Param("workspaceId") workspaceId: string, @Query(new ZodValidationPipe(querySchema)) query: unknown) {
    return this.search.search(workspaceId, (query as { q: string }).q);
  }
}
