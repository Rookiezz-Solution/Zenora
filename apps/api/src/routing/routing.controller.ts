import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import {
  createRoutingRuleSchema,
  createScoringRuleSchema,
  reorderRoutingRulesSchema,
  updateRoutingRuleSchema,
  updateScoringRuleSchema
} from "./dto/routing.dto";
import { RoutingRulesService } from "./routing-rules.service";

@Controller("routing/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("routing.manage")
export class RoutingController {
  constructor(private readonly routing: RoutingRulesService) {}

  @Get("rules")
  listRules(@Param("workspaceId") workspaceId: string) {
    return this.routing.listRoutingRules(workspaceId);
  }

  @Post("rules")
  createRule(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(createRoutingRuleSchema)) body: unknown) {
    return this.routing.createRoutingRule(workspaceId, body as never);
  }

  @Patch("rules/reorder")
  reorderRules(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(reorderRoutingRulesSchema)) body: unknown) {
    return this.routing.reorderRoutingRules(workspaceId, body as never);
  }

  @Patch("rules/:id")
  updateRule(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateRoutingRuleSchema)) body: unknown
  ) {
    return this.routing.updateRoutingRule(workspaceId, id, body as never);
  }

  @Delete("rules/:id")
  removeRule(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.routing.removeRoutingRule(workspaceId, id);
  }

  @Get("scoring")
  listScoring(@Param("workspaceId") workspaceId: string) {
    return this.routing.listScoringRules(workspaceId);
  }

  @Post("scoring")
  createScoring(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(createScoringRuleSchema)) body: unknown) {
    return this.routing.createScoringRule(workspaceId, body as never);
  }

  @Patch("scoring/:id")
  updateScoring(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateScoringRuleSchema)) body: unknown
  ) {
    return this.routing.updateScoringRule(workspaceId, id, body as never);
  }

  @Delete("scoring/:id")
  removeScoring(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.routing.removeScoringRule(workspaceId, id);
  }
}
