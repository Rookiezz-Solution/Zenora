import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@zenora/db";
import { collectTemplateText, findPersonalData, substituteTemplateVariables, templateOrigin, type FlowGraph } from "@zenora/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateFlowTemplateDto,
  ListFlowTemplatesQuery,
  UpdateFlowTemplateDto,
  UseFlowTemplateDto
} from "./dto/flow-templates.dto";

type TemplateRow = Prisma.FlowTemplateGetPayload<object>;

@Injectable()
export class FlowTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  // What a workspace may see: its own templates, Zenora's built-in ones,
  // community templates a super admin has approved, and templates a sibling
  // workspace of the same agency chose to share with it.
  private async visibleTo(workspaceId: string): Promise<Prisma.FlowTemplateWhereInput> {
    const ws = await this.prisma.client.workspace.findUnique({ where: { id: workspaceId }, select: { agencyId: true } });
    return {
      OR: [
        { workspaceId },
        { workspaceId: null },
        { scope: "public", publishStatus: "approved" },
        ...(ws?.agencyId ? [{ scope: "agency", workspace: { agencyId: ws.agencyId } }] : [])
      ]
    };
  }

  // The caller's view of a template: where it came from, never who made it, and
  // review state only for their own.
  private present(t: TemplateRow, viewerWorkspaceId: string) {
    const origin = templateOrigin(t, viewerWorkspaceId);
    const mine = origin === "mine";
    return { ...t, origin, workspaceId: mine ? t.workspaceId : null, publishStatus: mine ? t.publishStatus : null, publishNote: mine ? t.publishNote : null };
  }

  async list(workspaceId: string, query: ListFlowTemplatesQuery) {
    const visible = await this.visibleTo(workspaceId);
    const ws = await this.prisma.client.workspace.findUnique({ where: { id: workspaceId }, select: { agencyId: true } });
    const scopeFilter: Prisma.FlowTemplateWhereInput =
      query.scope === "mine"
        ? { workspaceId }
        : query.scope === "agency"
          ? { scope: "agency", workspaceId: { not: workspaceId }, ...(ws?.agencyId ? { workspace: { agencyId: ws.agencyId } } : { id: "none" }) }
          : query.scope === "public"
            ? { OR: [{ workspaceId: null }, { scope: "public", publishStatus: "approved", workspaceId: { not: workspaceId } }] }
            : {};
    const rows = await this.prisma.client.flowTemplate.findMany({
      where: { AND: [visible, scopeFilter, query.industry ? { industry: query.industry } : {}] },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    return rows.map((t) => this.present(t, workspaceId));
  }

  async getById(workspaceId: string, id: string) {
    const template = await this.prisma.client.flowTemplate.findFirst({ where: { AND: [{ id }, await this.visibleTo(workspaceId)] } });
    if (!template) throw new NotFoundException("Template not found");
    return this.present(template, workspaceId);
  }

  async create(workspaceId: string, userId: string, dto: CreateFlowTemplateDto) {
    const template = await this.prisma.client.flowTemplate.create({
      data: { workspaceId, name: dto.name, industry: dto.industry, scope: "private", graph: dto.graph as unknown as Prisma.InputJsonValue }
    });
    await this.audit.log({ workspaceId, userId, action: "flow_template.created", entityType: "flow_template", entityId: template.id });
    return this.present(template, workspaceId);
  }

  async update(workspaceId: string, id: string, userId: string, dto: UpdateFlowTemplateDto) {
    const existing = await this.ensureOwned(workspaceId, id);
    // Changing a template that is public or waiting for review takes it back to
    // private, so what a reviewer approved can't be swapped for something else
    // afterwards. The author can ask to publish again.
    const unpublish = existing.scope === "public" || existing.publishStatus === "pending" ? { scope: "private", publishStatus: null, publishNote: null } : {};
    const template = await this.prisma.client.flowTemplate.update({
      where: { id },
      data: { ...dto, ...unpublish, graph: dto.graph ? (dto.graph as unknown as Prisma.InputJsonValue) : undefined }
    });
    await this.audit.log({ workspaceId, userId, action: "flow_template.updated", entityType: "flow_template", entityId: id });
    return this.present(template, workspaceId);
  }

  async remove(workspaceId: string, id: string, userId: string) {
    await this.ensureOwned(workspaceId, id);
    await this.prisma.client.flowTemplate.delete({ where: { id } });
    await this.audit.log({ workspaceId, userId, action: "flow_template.deleted", entityType: "flow_template", entityId: id });
  }

  // --- sharing -------------------------------------------------------------

  async share(workspaceId: string, id: string, userId: string, scope: "private" | "agency") {
    const template = await this.ensureOwned(workspaceId, id);
    if (scope === "agency") {
      const ws = await this.prisma.client.workspace.findUnique({ where: { id: workspaceId }, select: { agencyId: true } });
      if (!ws?.agencyId) throw new BadRequestException("Only workspaces managed by an agency can share with it");
    }
    // Going back to private also withdraws any public request.
    const updated = await this.prisma.client.flowTemplate.update({
      where: { id },
      data: { scope, ...(scope === "private" || template.scope === "public" ? { publishStatus: null, publishNote: null } : {}) }
    });
    await this.audit.log({ workspaceId, userId, action: "flow_template.shared", entityType: "flow_template", entityId: id, metadata: { scope } });
    return this.present(updated, workspaceId);
  }

  // Asking for a place in the public gallery. Nothing becomes public until a
  // super admin approves it, and a template carrying anyone's phone number or
  // email is refused outright.
  async requestPublish(workspaceId: string, id: string, userId: string) {
    const template = await this.ensureOwned(workspaceId, id);
    if (template.publishStatus === "pending") throw new ConflictException("Already waiting for review");
    if (template.scope === "public") throw new ConflictException("Already public");

    const graph = template.graph as unknown as FlowGraph;
    if (Object.keys(graph.blocks ?? {}).length === 0) throw new BadRequestException("Add some steps before publishing");
    const issues = findPersonalData(graph);
    if (issues.length > 0) {
      throw new BadRequestException({
        message: "Remove phone numbers and email addresses from the template before publishing it. Use {placeholders} instead.",
        issues
      });
    }

    const updated = await this.prisma.client.flowTemplate.update({ where: { id }, data: { publishStatus: "pending", publishNote: null } });
    await this.audit.log({ workspaceId, userId, action: "flow_template.publish_requested", entityType: "flow_template", entityId: id });
    return this.present(updated, workspaceId);
  }

  async withdrawPublish(workspaceId: string, id: string, userId: string) {
    const template = await this.ensureOwned(workspaceId, id);
    const updated = await this.prisma.client.flowTemplate.update({
      where: { id },
      data: { publishStatus: null, publishNote: null, ...(template.scope === "public" ? { scope: "private" } : {}) }
    });
    await this.audit.log({ workspaceId, userId, action: "flow_template.publish_withdrawn", entityType: "flow_template", entityId: id });
    return this.present(updated, workspaceId);
  }

  // --- moderation (super admin) -------------------------------------------

  async pendingReview() {
    const rows = await this.prisma.client.flowTemplate.findMany({ where: { publishStatus: "pending" }, orderBy: { createdAt: "asc" }, take: 100 });
    return rows.map((t) => ({ id: t.id, name: t.name, industry: t.industry, createdAt: t.createdAt, text: collectTemplateText(t.graph).filter((s) => s.trim().length > 0).slice(0, 40) }));
  }

  async approve(adminUserId: string, id: string) {
    const template = await this.requirePending(id);
    // Checked again at the moment of approval, not just at the request.
    if (findPersonalData(template.graph).length > 0) throw new BadRequestException("This template now contains a phone number or email address");
    await this.prisma.client.flowTemplate.update({ where: { id }, data: { scope: "public", publishStatus: "approved", publishNote: null } });
    await this.prisma.client.platformAuditLog.create({ data: { userId: adminUserId, action: "template.approved", detail: template.name } });
    return { ok: true };
  }

  async reject(adminUserId: string, id: string, reason: string) {
    const template = await this.requirePending(id);
    await this.prisma.client.flowTemplate.update({ where: { id }, data: { publishStatus: "rejected", publishNote: reason } });
    await this.prisma.client.platformAuditLog.create({ data: { userId: adminUserId, action: "template.rejected", detail: `${template.name}: ${reason}` } });
    return { ok: true };
  }

  private async requirePending(id: string) {
    const template = await this.prisma.client.flowTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException("Template not found");
    if (template.publishStatus !== "pending") throw new ConflictException("This template is not waiting for review");
    return template;
  }

  // --- using ---------------------------------------------------------------

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
      throw new ForbiddenException("Only the workspace that made a template can change it");
    }
    return template;
  }
}
