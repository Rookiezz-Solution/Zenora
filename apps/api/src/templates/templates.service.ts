import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@zenora/db";
import { MetaGraphClient } from "../channels/meta-graph.client";
import { decryptToken } from "../common/encryption";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateWaTemplateDto, ListWaTemplatesQuery, UpdateWaTemplateDto } from "./dto/wa-template.dto";

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly meta: MetaGraphClient
  ) {}

  list(workspaceId: string, query: ListWaTemplatesQuery) {
    return this.prisma.client.waTemplate.findMany({
      where: { workspaceId, ...(query.scope === "approved" ? { metaStatus: "approved" } : {}) },
      orderBy: { name: "asc" }
    });
  }

  async getById(workspaceId: string, id: string) {
    const template = await this.prisma.client.waTemplate.findFirst({ where: { id, workspaceId } });
    if (!template) throw new NotFoundException("Template not found");
    return template;
  }

  async create(workspaceId: string, userId: string, dto: CreateWaTemplateDto) {
    const existing = await this.prisma.client.waTemplate.findFirst({ where: { workspaceId, name: dto.name, language: dto.language } });
    if (existing) throw new ConflictException(`A template named "${dto.name}" already exists for this language`);

    const template = await this.prisma.client.waTemplate.create({
      data: { workspaceId, ...dto, buttons: dto.buttons as unknown as Prisma.InputJsonValue }
    });
    await this.audit.log({ workspaceId, userId, action: "wa_template.created", entityType: "wa_template", entityId: template.id });
    return template;
  }

  async update(workspaceId: string, id: string, userId: string, dto: UpdateWaTemplateDto) {
    const template = await this.getById(workspaceId, id);
    if (template.submittedAt) {
      throw new ConflictException("Already submitted to Meta — create a new template instead of editing this one");
    }
    const updated = await this.prisma.client.waTemplate.update({
      where: { id },
      data: { ...dto, buttons: dto.buttons ? (dto.buttons as unknown as Prisma.InputJsonValue) : undefined }
    });
    await this.audit.log({ workspaceId, userId, action: "wa_template.updated", entityType: "wa_template", entityId: id });
    return updated;
  }

  async remove(workspaceId: string, id: string, userId: string) {
    const template = await this.getById(workspaceId, id);
    if (template.submittedAt) {
      throw new ConflictException("Already submitted to Meta — this template can't be deleted here");
    }
    await this.prisma.client.waTemplate.delete({ where: { id } });
    await this.audit.log({ workspaceId, userId, action: "wa_template.deleted", entityType: "wa_template", entityId: id });
  }

  async submit(workspaceId: string, id: string, userId: string) {
    const template = await this.getById(workspaceId, id);
    if (template.submittedAt) throw new ConflictException("Already submitted to Meta");

    const number = await this.prisma.client.whatsappNumber.findFirst({ where: { workspaceId } });
    if (!number) throw new BadRequestException("Connect a WhatsApp number before submitting templates");

    const { metaTemplateId, status } = await this.meta.submitWhatsappTemplate(number.wabaId, decryptToken(number.accessTokenCipher), {
      name: template.name,
      category: template.category as "marketing" | "utility" | "authentication",
      language: template.language,
      headerType: template.headerType as "none" | "text" | "image" | "video" | "document",
      headerText: template.headerText ?? undefined,
      bodyText: template.bodyText,
      footerText: template.footerText ?? undefined,
      buttons: template.buttons as unknown as Array<{ type: "quick_reply" | "url" | "phone_number"; text: string; url?: string; phoneNumber?: string }>
    });

    const updated = await this.prisma.client.waTemplate.update({
      where: { id },
      data: { metaTemplateId, metaStatus: status.toLowerCase(), submittedAt: new Date() }
    });
    await this.audit.log({ workspaceId, userId, action: "wa_template.submitted", entityType: "wa_template", entityId: id });
    return updated;
  }

  // Manual "refresh status" — the automatic path is the worker's webhook
  // handler for message_template_status_update.
  async sync(workspaceId: string, id: string, userId: string) {
    const template = await this.getById(workspaceId, id);
    if (!template.metaTemplateId) throw new BadRequestException("This template hasn't been submitted to Meta yet");

    const number = await this.prisma.client.whatsappNumber.findFirst({ where: { workspaceId } });
    if (!number) throw new BadRequestException("No connected WhatsApp number for this workspace");

    const { status, rejectionReason } = await this.meta.getWhatsappTemplateStatus(template.metaTemplateId, decryptToken(number.accessTokenCipher));
    const updated = await this.prisma.client.waTemplate.update({
      where: { id },
      data: { metaStatus: status.toLowerCase(), rejectionReason: rejectionReason ?? null }
    });
    await this.audit.log({ workspaceId, userId, action: "wa_template.synced", entityType: "wa_template", entityId: id, metadata: { status } });
    return updated;
  }
}
