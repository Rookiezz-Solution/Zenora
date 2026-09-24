import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@zenora/db";
import { substituteTemplateVariables, type FlowGraph } from "@zenora/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateFlowTemplateDto,
  ListFlowTemplatesQuery,
  UpdateFlowTemplateDto,
  UseFlowTemplateDto
} from "./dto/flow-templates.dto";

@Injectable()
export class FlowTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  list(workspaceId: string, query: ListFlowTemplatesQuery) {
    const scopeFilter =
      query.scope === "mine" ? { workspaceId } : query.scope === "public" ? { workspaceId: null } : { OR: [{ workspaceId }, { workspaceId: null }] };
    return this.prisma.client.flowTemplate.findMany({
      where: { ...scopeFilter, ...(query.industry ? { industry: query.industry } : {}) },
      orderBy: { createdAt: "desc" }
    });
  }

  async getById(workspaceId: string, id: string) {
    const template = await this.prisma.client.flowTemplate.findFirst({
      where: { id, OR: [{ workspaceId }, { workspaceId: null }] }
    });
    if (!template) throw new NotFoundException("Template not found");
    return template;
  }

  async create(workspaceId: string, userId: string, dto: CreateFlowTemplateDto) {
    const template = await this.prisma.client.flowTemplate.create({
      data: { workspaceId, name: dto.name, industry: dto.industry, scope: "private", graph: dto.graph as unknown as Prisma.InputJsonValue }
    });
    await this.audit.log({ workspaceId, userId, action: "flow_template.created", entityType: "flow_template", entityId: template.id });
    return template;
  }

  async update(workspaceId: string, id: string, userId: string, dto: UpdateFlowTemplateDto) {
    await this.ensureOwned(workspaceId, id);
    const template = await this.prisma.client.flowTemplate.update({
      where: { id },
      data: { ...dto, graph: dto.graph ? (dto.graph as unknown as Prisma.InputJsonValue) : undefined }
    });
    await this.audit.log({ workspaceId, userId, action: "flow_template.updated", entityType: "flow_template", entityId: id });
    return template;
  }

  async remove(workspaceId: string, id: string, userId: string) {
    await this.ensureOwned(workspaceId, id);
    await this.prisma.client.flowTemplate.delete({ where: { id } });
    await this.audit.log({ workspaceId, userId, action: "flow_template.deleted", entityType: "flow_template", entityId: id });
  }

  // Creates a brand-new automation whose starting draft is the template's
  // graph, with {business_name} etc. filled in from the workspace — docs/
  // PRD.md: "template editor with fill-in variables {business_name}."
  async use(workspaceId: string, id: string, userId: string, dto: UseFlowTemplateDto) {
    const template = await this.getById(workspaceId, id);
    const workspace = await this.prisma.client.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const filledGraph = substituteTemplateVariables(template.graph as unknown as FlowGraph, { business_name: workspace.name });

    const automation = await this.prisma.client.automation.create({ data: { workspaceId, name: dto.name } });
    await this.prisma.client.automationVersion.create({
      data: { automationId: automation.id, version: 1, graph: filledGraph as unknown as Prisma.InputJsonValue }
    });
    await this.audit.log({
      workspaceId,
      userId,
      action: "flow_template.used",
      entityType: "automation",
      entityId: automation.id,
      metadata: { templateId: id }
    });
    return automation;
  }

  private async ensureOwned(workspaceId: string, id: string) {
    const template = await this.prisma.client.flowTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException("Template not found");
    if (template.workspaceId !== workspaceId) {
      throw new ForbiddenException("Public templates can't be edited or deleted");
    }
    return template;
  }
}
