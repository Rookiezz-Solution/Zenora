import { ConflictException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { leadWebhookData, normalizePhone } from "@zenora/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RoutingEngineService } from "../routing/routing-engine.service";
import type { PublicCreateLeadDto, PublicListLeadsQuery } from "./developers.dto";
import { WebhooksService } from "./webhooks.service";

// The public shape of a lead — a stable subset, not the database row.
const LEAD_SELECT = { id: true, name: true, phone: true, email: true, source: true, stageId: true, score: true, createdAt: true, updatedAt: true } as const;

@Injectable()
export class PublicApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: RoutingEngineService,
    private readonly webhooks: WebhooksService
  ) {}

  async listLeads(workspaceId: string, query: PublicListLeadsQuery) {
    const phone = query.phone ? normalizePhone(query.phone) : undefined;
    const rows = await this.prisma.client.lead.findMany({
      where: { workspaceId, mergedIntoId: null, ...(phone ? { phone } : {}), ...(query.email ? { email: query.email } : {}) },
      select: LEAD_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    const hasMore = rows.length > query.limit;
    const data = hasMore ? rows.slice(0, query.limit) : rows;
    return { data, nextCursor: hasMore ? data[data.length - 1]!.id : null };
  }

  async getLead(workspaceId: string, id: string) {
    const lead = await this.prisma.client.lead.findFirst({ where: { id, workspaceId, mergedIntoId: null }, select: LEAD_SELECT });
    if (!lead) throw new NotFoundException("Lead not found");
    return lead;
  }

  async createLead(workspaceId: string, dto: PublicCreateLeadDto) {
    const phone = dto.phone ? normalizePhone(dto.phone) : undefined;
    if (dto.phone && !phone) throw new BadRequestException("phone must be 8-15 digits, with an optional leading +");

    const duplicate = await this.prisma.client.lead.findFirst({
      where: { workspaceId, mergedIntoId: null, OR: [...(phone ? [{ phone }] : []), ...(dto.email ? [{ email: dto.email }] : [])] },
      select: { id: true }
    });
    if (duplicate) throw new ConflictException({ message: "A lead with this phone or email already exists", leadId: duplicate.id });

    const lead = await this.prisma.client.lead.create({
      data: { workspaceId, name: dto.name, phone: phone ?? undefined, email: dto.email, source: dto.source ?? "api" },
      select: { ...LEAD_SELECT }
    });
    await this.routing.applyToNewLead(workspaceId, lead.id);
    await this.webhooks.emit(workspaceId, "lead.created", leadWebhookData(lead));
    return lead;
  }
}
