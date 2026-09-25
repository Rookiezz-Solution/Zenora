import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { WHATSAPP_MESSAGE_COST_PAISE } from "@zenora/shared";
import { AuditService } from "../audit/audit.service";
import { MetaGraphClient } from "../channels/meta-graph.client";
import { decryptToken } from "../common/encryption";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";
import type { AudienceFilter, CreateBroadcastDto, SendTestDto } from "./dto/broadcasts.dto";

@Injectable()
export class BroadcastsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly meta: MetaGraphClient,
    private readonly queue: QueueService
  ) {}

  list(workspaceId: string) {
    return this.prisma.client.broadcast.findMany({
      where: { workspaceId },
      include: { template: { select: { name: true, category: true } }, _count: { select: { recipients: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  async getById(workspaceId: string, id: string) {
    const broadcast = await this.prisma.client.broadcast.findFirst({
      where: { id, workspaceId },
      include: { template: true, recipients: { include: { lead: true } } }
    });
    if (!broadcast) throw new NotFoundException("Broadcast not found");
    return broadcast;
  }

  async estimateAudience(workspaceId: string, filter: AudienceFilter) {
    const leadIds = await this.resolveAudience(workspaceId, filter);
    return { count: leadIds.length };
  }

  async create(workspaceId: string, userId: string, dto: CreateBroadcastDto) {
    const template = await this.prisma.client.waTemplate.findFirst({ where: { id: dto.templateId, workspaceId } });
    if (!template) throw new NotFoundException("Template not found");
    if (template.metaStatus !== "approved") {
      throw new BadRequestException("Only an approved template can be used for a broadcast");
    }

    const leadIds = await this.resolveAudience(workspaceId, dto.audienceFilter);
    const costPerMessage = WHATSAPP_MESSAGE_COST_PAISE[template.category as keyof typeof WHATSAPP_MESSAGE_COST_PAISE] ?? 0;

    const broadcast = await this.prisma.client.broadcast.create({
      data: {
        workspaceId,
        templateId: dto.templateId,
        audienceFilter: dto.audienceFilter,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        costEstimate: leadIds.length * costPerMessage,
        status: "draft"
      }
    });
    await this.audit.log({
      workspaceId,
      userId,
      action: "broadcast.created",
      entityType: "broadcast",
      entityId: broadcast.id,
      metadata: { audienceCount: leadIds.length }
    });
    return broadcast;
  }

  // docs/PRD.md: "send test" — delivers to one lead directly, outside the
  // broadcast's recipient list, so it never counts toward its stats.
  async sendTest(workspaceId: string, id: string, userId: string, dto: SendTestDto) {
    const broadcast = await this.getById(workspaceId, id);
    const [number, identity] = await Promise.all([
      this.prisma.client.whatsappNumber.findFirst({ where: { workspaceId } }),
      this.prisma.client.leadIdentity.findFirst({ where: { leadId: dto.leadId, type: "wa_phone" } })
    ]);
    if (!number) throw new BadRequestException("No connected WhatsApp number for this workspace");
    if (!identity) throw new BadRequestException("This lead has no WhatsApp identity to send a test to");

    await this.meta.sendWhatsappTemplate(number.phoneNumberId, identity.value, broadcast.template.name, broadcast.template.language, decryptToken(number.accessTokenCipher));
    await this.audit.log({ workspaceId, userId, action: "broadcast.test_sent", entityType: "broadcast", entityId: id, metadata: { leadId: dto.leadId } });
    return { sent: true };
  }

  async send(workspaceId: string, id: string, userId: string) {
    const broadcast = await this.getById(workspaceId, id);
    if (broadcast.status !== "draft") throw new BadRequestException(`Broadcast is already ${broadcast.status}`);

    const filter = broadcast.audienceFilter as unknown as AudienceFilter;
    const leadIds = await this.resolveAudience(workspaceId, filter);
    if (leadIds.length === 0) throw new BadRequestException("No leads match this broadcast's audience filter");

    await this.prisma.client.$transaction([
      this.prisma.client.broadcastRecipient.createMany({ data: leadIds.map((leadId) => ({ broadcastId: id, leadId })) }),
      this.prisma.client.broadcast.update({
        where: { id },
        data: { status: broadcast.scheduledAt && broadcast.scheduledAt > new Date() ? "scheduled" : "sending" }
      })
    ]);

    const delayMs = broadcast.scheduledAt && broadcast.scheduledAt > new Date() ? broadcast.scheduledAt.getTime() - Date.now() : 0;
    await this.queue.add("broadcasts", "send", { broadcastId: id }, delayMs);

    await this.audit.log({ workspaceId, userId, action: "broadcast.queued", entityType: "broadcast", entityId: id, metadata: { audienceCount: leadIds.length } });
    return this.getById(workspaceId, id);
  }

  private async resolveAudience(workspaceId: string, filter: AudienceFilter): Promise<string[]> {
    let leadIds = (
      await this.prisma.client.leadIdentity.findMany({
        where: { type: "wa_phone", lead: { workspaceId, mergedIntoId: null } },
        select: { leadId: true }
      })
    ).map((r) => r.leadId);
    if (leadIds.length === 0) return [];

    if (filter.tag) {
      const tagged = await this.prisma.client.leadTag.findMany({
        where: { leadId: { in: leadIds }, tag: { name: filter.tag, workspaceId } },
        select: { leadId: true }
      });
      leadIds = tagged.map((t) => t.leadId);
    }

    if (filter.optedInOnly) {
      const opted = await this.prisma.client.consent.findMany({
        where: { leadId: { in: leadIds }, type: "marketing", granted: true },
        select: { leadId: true }
      });
      leadIds = opted.map((o) => o.leadId);
    }

    if (filter.skipRecentlyMessagedHours && leadIds.length > 0) {
      const cutoff = new Date(Date.now() - filter.skipRecentlyMessagedHours * 3_600_000);
      const recentlyMessaged = await this.prisma.client.message.findMany({
        where: { direction: "outbound", createdAt: { gte: cutoff }, conversation: { leadId: { in: leadIds } } },
        select: { conversation: { select: { leadId: true } } }
      });
      const excluded = new Set(recentlyMessaged.map((m) => m.conversation.leadId).filter((id): id is string => !!id));
      leadIds = leadIds.filter((id) => !excluded.has(id));
    }

    return leadIds;
  }
}
