import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@zenora/db";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateRoutingRuleDto,
  CreateScoringRuleDto,
  ReorderRoutingRulesDto,
  UpdateRoutingRuleDto,
  UpdateScoringRuleDto
} from "./dto/routing.dto";

@Injectable()
export class RoutingRulesService {
  constructor(private readonly prisma: PrismaService) {}

  listRoutingRules(workspaceId: string) {
    return this.prisma.client.routingRule.findMany({ where: { workspaceId }, orderBy: { order: "asc" } });
  }

  async createRoutingRule(workspaceId: string, dto: CreateRoutingRuleDto) {
    const count = await this.prisma.client.routingRule.count({ where: { workspaceId } });
    return this.prisma.client.routingRule.create({
      data: {
        workspaceId,
        order: count,
        conditions: dto.conditions as unknown as Prisma.InputJsonValue,
        assignTo: dto.assignTo as unknown as Prisma.InputJsonValue
      }
    });
  }

  async updateRoutingRule(workspaceId: string, id: string, dto: UpdateRoutingRuleDto) {
    const result = await this.prisma.client.routingRule.updateMany({
      where: { id, workspaceId },
      data: {
        ...(dto.conditions ? { conditions: dto.conditions as unknown as Prisma.InputJsonValue } : {}),
        ...(dto.assignTo ? { assignTo: dto.assignTo as unknown as Prisma.InputJsonValue } : {})
      }
    });
    if (result.count === 0) throw new NotFoundException("Routing rule not found");
    return this.prisma.client.routingRule.findUniqueOrThrow({ where: { id } });
  }

  async removeRoutingRule(workspaceId: string, id: string) {
    const result = await this.prisma.client.routingRule.deleteMany({ where: { id, workspaceId } });
    if (result.count === 0) throw new NotFoundException("Routing rule not found");
  }

  async reorderRoutingRules(workspaceId: string, dto: ReorderRoutingRulesDto) {
    await this.prisma.client.$transaction(
      dto.ruleIds.map((id, index) => this.prisma.client.routingRule.updateMany({ where: { id, workspaceId }, data: { order: index } }))
    );
    return this.listRoutingRules(workspaceId);
  }

  listScoringRules(workspaceId: string) {
    return this.prisma.client.scoringRule.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  }

  createScoringRule(workspaceId: string, dto: CreateScoringRuleDto) {
    return this.prisma.client.scoringRule.create({
      data: { workspaceId, condition: dto.condition as unknown as Prisma.InputJsonValue, points: dto.points }
    });
  }

  async updateScoringRule(workspaceId: string, id: string, dto: UpdateScoringRuleDto) {
    const result = await this.prisma.client.scoringRule.updateMany({
      where: { id, workspaceId },
      data: {
        ...(dto.condition ? { condition: dto.condition as unknown as Prisma.InputJsonValue } : {}),
        ...(dto.points !== undefined ? { points: dto.points } : {})
      }
    });
    if (result.count === 0) throw new NotFoundException("Scoring rule not found");
    return this.prisma.client.scoringRule.findUniqueOrThrow({ where: { id } });
  }

  async removeScoringRule(workspaceId: string, id: string) {
    const result = await this.prisma.client.scoringRule.deleteMany({ where: { id, workspaceId } });
    if (result.count === 0) throw new NotFoundException("Scoring rule not found");
  }
}
