import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { decryptToken } from "../common/encryption";
import { MetaGraphClient } from "../channels/meta-graph.client";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import type { AssignConversationDto, HandoverDto, ListConversationsQuery, SendMessageDto } from "./dto/inbox.dto";

const MESSAGE_PAGE_SIZE = 50;

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meta: MetaGraphClient,
    private readonly realtime: RealtimeService
  ) {}

  async listConversations(workspaceId: string, userId: string, query: ListConversationsQuery) {
    const conversations = await this.prisma.client.conversation.findMany({
      where: { workspaceId },
      include: {
        lead: { select: { id: true, name: true, phone: true, email: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 }
      },
      orderBy: { updatedAt: "desc" },
      take: 200
    });

    switch (query.filter) {
      case "mine":
        return conversations.filter((c) => c.assignedToId === userId);
      case "unassigned":
        return conversations.filter((c) => !c.assignedToId);
      case "bot_active":
        return conversations.filter((c) => c.botActive);
      case "waiting_on_us":
        return conversations.filter((c) => c.messages[0]?.direction === "inbound");
      default:
        return conversations;
    }
  }

  async getMessages(workspaceId: string, conversationId: string, before?: string) {
    const conversation = await this.prisma.client.conversation.findFirst({ where: { id: conversationId, workspaceId } });
    if (!conversation) throw new NotFoundException("Conversation not found");

    const cursor = before ? { id: before } : undefined;
    const messages = await this.prisma.client.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: MESSAGE_PAGE_SIZE,
      ...(cursor ? { cursor, skip: 1 } : {})
    });
    return { conversation, messages: messages.reverse() };
  }

  async sendMessage(workspaceId: string, conversationId: string, senderId: string, dto: SendMessageDto) {
    const conversation = await this.prisma.client.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      include: { lead: { include: { identities: true } } }
    });
    if (!conversation || !conversation.lead) throw new NotFoundException("Conversation not found");

    const { externalId, body, type } =
      conversation.channel === "instagram"
        ? await this.sendInstagram(workspaceId, conversation.lead.identities, dto)
        : await this.sendWhatsapp(workspaceId, conversation, conversation.lead.identities, dto);

    const message = await this.prisma.client.message.create({
      data: { conversationId, direction: "outbound", type, body, externalId, status: "sent" }
    });
    await this.prisma.client.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    // A human reply is what the SLA is actually measuring (docs/PRD.md's
    // "call within N minutes else reassign") — bot sends don't count.
    await this.prisma.client.slaTimer.updateMany({
      where: { workspaceId, leadId: conversation.lead.id, resolvedAt: null },
      data: { resolvedAt: new Date() }
    });

    await this.realtime.publish({ workspaceId, type: "message.created", payload: message });
    return message;
  }

  private async sendInstagram(
    workspaceId: string,
    identities: Array<{ type: string; value: string }>,
    dto: SendMessageDto
  ) {
    if (!dto.body) throw new BadRequestException("Instagram messages need body text");
    const recipient = identities.find((i) => i.type === "ig_scoped_id");
    if (!recipient) throw new BadRequestException("Lead has no linked Instagram identity");

    const account = await this.prisma.client.instagramAccount.findFirst({ where: { workspaceId } });
    if (!account) throw new BadRequestException("No connected Instagram account for this workspace");

    const externalId = await this.meta.sendInstagramMessage(
      account.igUserId,
      recipient.value,
      dto.body,
      decryptToken(account.accessTokenCipher)
    );
    return { externalId, body: dto.body, type: "text" };
  }

  private async sendWhatsapp(
    workspaceId: string,
    conversation: { windowExpiresAt: Date | null },
    identities: Array<{ type: string; value: string }>,
    dto: SendMessageDto
  ) {
    const recipient = identities.find((i) => i.type === "wa_phone");
    if (!recipient) throw new BadRequestException("Lead has no linked WhatsApp identity");

    const number = await this.prisma.client.whatsappNumber.findFirst({ where: { workspaceId } });
    if (!number) throw new BadRequestException("No connected WhatsApp number for this workspace");
    const accessToken = decryptToken(number.accessTokenCipher);

    const outsideWindow = !conversation.windowExpiresAt || conversation.windowExpiresAt < new Date();
    if (outsideWindow) {
      // CLAUDE.md rule #5: outside the 24h window only an approved template
      // may be sent.
      if (!dto.templateId) {
        throw new BadRequestException("Outside the 24h window — pick an approved template to send");
      }
      const template = await this.prisma.client.waTemplate.findFirst({
        where: { id: dto.templateId, workspaceId, metaStatus: "approved" }
      });
      if (!template) throw new BadRequestException("Template not found or not approved");

      const externalId = await this.meta.sendWhatsappTemplate(
        number.phoneNumberId,
        recipient.value,
        template.name,
        template.language,
        accessToken
      );
      return { externalId, body: template.bodyText, type: "template" };
    }

    if (!dto.body) throw new BadRequestException("Message body is required");
    const externalId = await this.meta.sendWhatsappText(number.phoneNumberId, recipient.value, dto.body, accessToken);
    return { externalId, body: dto.body, type: "text" };
  }

  async setHandover(workspaceId: string, conversationId: string, dto: HandoverDto) {
    const conversation = await this.prisma.client.conversation.updateMany({
      where: { id: conversationId, workspaceId },
      data: { botActive: dto.active }
    });
    if (conversation.count === 0) throw new NotFoundException("Conversation not found");
    const updated = await this.prisma.client.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    await this.realtime.publish({ workspaceId, type: "conversation.updated", payload: updated });
    return updated;
  }

  async assign(workspaceId: string, conversationId: string, dto: AssignConversationDto) {
    const result = await this.prisma.client.conversation.updateMany({
      where: { id: conversationId, workspaceId },
      data: { assignedToId: dto.userId }
    });
    if (result.count === 0) throw new NotFoundException("Conversation not found");
    const updated = await this.prisma.client.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    await this.realtime.publish({ workspaceId, type: "conversation.updated", payload: updated });
    return updated;
  }
}
