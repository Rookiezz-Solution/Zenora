import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@zenora/db";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type {
  AddNoteDto,
  AddTagDto,
  CreateLeadDto,
  ImportLeadsDto,
  ListLeadsQuery,
  MergeLeadsDto,
  MoveStageDto,
  UpdateLeadDto
} from "./dto/leads.dto";

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(workspaceId: string, query: ListLeadsQuery) {
    return this.prisma.client.lead.findMany({
      where: {
        workspaceId,
        mergedIntoId: null,
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: "insensitive" } },
                { phone: { contains: query.search } },
                { email: { contains: query.search, mode: "insensitive" } }
              ]
            }
          : {}),
        ...(query.tag ? { tags: { some: { tag: { name: query.tag } } } } : {})
      },
      include: { tags: { include: { tag: true } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async getById(workspaceId: string, leadId: string) {
    const lead = await this.prisma.client.lead.findFirst({
      where: { id: leadId, workspaceId },
      include: {
        identities: true,
        tags: { include: { tag: true } },
        notes: { include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
        consents: true,
        fieldValues: { include: { field: true } }
      }
    });
    if (!lead) throw new NotFoundException("Lead not found");
    return lead;
  }

  private async findDuplicateBy(workspaceId: string, phone?: string, email?: string) {
    if (!phone && !email) return null;
    return this.prisma.client.lead.findFirst({
      where: {
        workspaceId,
        mergedIntoId: null,
        OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])]
      }
    });
  }

  async create(workspaceId: string, userId: string, dto: CreateLeadDto) {
    const duplicate = await this.findDuplicateBy(workspaceId, dto.phone, dto.email);
    if (duplicate) {
      throw new ConflictException({ message: "A lead with this phone or email already exists", duplicate });
    }
    const lead = await this.prisma.client.lead.create({ data: { workspaceId, ...dto } });
    await this.audit.log({ workspaceId, userId, action: "lead.created", entityType: "lead", entityId: lead.id });
    return lead;
  }

  async update(workspaceId: string, leadId: string, userId: string, dto: UpdateLeadDto) {
    const result = await this.prisma.client.lead.updateMany({ where: { id: leadId, workspaceId }, data: dto });
    if (result.count === 0) throw new NotFoundException("Lead not found");
    await this.audit.log({ workspaceId, userId, action: "lead.updated", entityType: "lead", entityId: leadId });
    return this.prisma.client.lead.findUniqueOrThrow({ where: { id: leadId } });
  }

  async remove(workspaceId: string, leadId: string, userId: string) {
    const result = await this.prisma.client.lead.deleteMany({ where: { id: leadId, workspaceId } });
    if (result.count === 0) throw new NotFoundException("Lead not found");
    await this.audit.log({ workspaceId, userId, action: "lead.deleted", entityType: "lead", entityId: leadId });
  }

  async addTag(workspaceId: string, leadId: string, userId: string, dto: AddTagDto) {
    await this.ensureLead(workspaceId, leadId);
    const tag = await this.prisma.client.tag.upsert({
      where: { workspaceId_name: { workspaceId, name: dto.name } },
      update: {},
      create: { workspaceId, name: dto.name }
    });
    await this.prisma.client.leadTag.upsert({
      where: { leadId_tagId: { leadId, tagId: tag.id } },
      update: {},
      create: { leadId, tagId: tag.id }
    });
    await this.audit.log({ workspaceId, userId, action: "lead.tagged", entityType: "lead", entityId: leadId, metadata: { tag: dto.name } });
    return tag;
  }

  async removeTag(workspaceId: string, leadId: string, tagId: string) {
    await this.ensureLead(workspaceId, leadId);
    await this.prisma.client.leadTag.deleteMany({ where: { leadId, tagId } });
  }

  async addNote(workspaceId: string, leadId: string, authorId: string, dto: AddNoteDto) {
    await this.ensureLead(workspaceId, leadId);
    return this.prisma.client.note.create({ data: { leadId, authorId, body: dto.body } });
  }

  async getTimeline(workspaceId: string, leadId: string) {
    await this.ensureLead(workspaceId, leadId);

    const [notes, messages, tasks] = await Promise.all([
      this.prisma.client.note.findMany({
        where: { leadId },
        include: { author: { select: { id: true, name: true } } }
      }),
      this.prisma.client.message.findMany({
        where: { conversation: { leadId } },
        include: { conversation: { select: { channel: true } } }
      }),
      this.prisma.client.task.findMany({ where: { leadId } })
    ]);

    // Unified timeline (docs/PRD.md's "messages, bot steps, routing, calls,
    // meetings, stage changes, tasks, notes"). Bot steps/routing/calls/
    // meetings aren't built yet (automation engine, telephony are later
    // phases) — merged from what exists today: messages, notes, tasks.
    const events = [
      ...notes.map((n) => ({ type: "note" as const, at: n.createdAt, data: n })),
      ...messages.map((m) => ({ type: "message" as const, at: m.createdAt, data: m })),
      ...tasks.map((t) => ({ type: "task" as const, at: t.createdAt, data: t }))
    ];
    events.sort((a, b) => b.at.getTime() - a.at.getTime());
    return events;
  }

  async findDuplicates(workspaceId: string, leadId: string) {
    const lead = await this.ensureLead(workspaceId, leadId);
    if (!lead.phone && !lead.email) return [];
    return this.prisma.client.lead.findMany({
      where: {
        workspaceId,
        id: { not: leadId },
        mergedIntoId: null,
        OR: [...(lead.phone ? [{ phone: lead.phone }] : []), ...(lead.email ? [{ email: lead.email }] : [])]
      }
    });
  }

  async merge(workspaceId: string, userId: string, dto: MergeLeadsDto) {
    const [primary, duplicate] = await Promise.all([
      this.ensureLead(workspaceId, dto.primaryLeadId),
      this.ensureLead(workspaceId, dto.duplicateLeadId)
    ]);
    if (primary.id === duplicate.id) throw new ConflictException("Cannot merge a lead into itself");

    await this.prisma.client.$transaction(async (tx) => {
      await tx.leadIdentity.updateMany({ where: { leadId: duplicate.id }, data: { leadId: primary.id } });
      await tx.note.updateMany({ where: { leadId: duplicate.id }, data: { leadId: primary.id } });
      await tx.conversation.updateMany({ where: { leadId: duplicate.id }, data: { leadId: primary.id } });
      await tx.task.updateMany({ where: { leadId: duplicate.id }, data: { leadId: primary.id } });

      const dupTags = await tx.leadTag.findMany({ where: { leadId: duplicate.id } });
      for (const lt of dupTags) {
        await tx.leadTag.upsert({
          where: { leadId_tagId: { leadId: primary.id, tagId: lt.tagId } },
          update: {},
          create: { leadId: primary.id, tagId: lt.tagId }
        });
      }
      await tx.leadTag.deleteMany({ where: { leadId: duplicate.id } });

      await tx.lead.update({
        where: { id: primary.id },
        data: {
          name: primary.name ?? duplicate.name,
          phone: primary.phone ?? duplicate.phone,
          email: primary.email ?? duplicate.email
        }
      });
      await tx.lead.update({ where: { id: duplicate.id }, data: { mergedIntoId: primary.id } });
    });

    await this.audit.log({
      workspaceId,
      userId,
      action: "lead.merged",
      entityType: "lead",
      entityId: primary.id,
      metadata: { duplicateLeadId: duplicate.id }
    });
    return this.getById(workspaceId, primary.id);
  }

  // docs/PRD.md: "Moving to a stage with required fields opens a form; Won/
  // Lost trigger their automations." The automation trigger itself is a
  // no-op until the automation engine (Phase 1 item 5) exists — this just
  // logs the transition so it's there to hook into.
  async moveStage(workspaceId: string, leadId: string, userId: string, dto: MoveStageDto) {
    const lead = await this.ensureLead(workspaceId, leadId);
    const stage = await this.prisma.client.stage.findFirst({
      where: { id: dto.stageId, pipeline: { workspaceId } },
      include: { pipeline: true }
    });
    if (!stage) throw new NotFoundException("Stage not found");

    const missing = stage.requiredFieldIds.filter((fieldId) => {
      const value = dto.fieldValues?.[fieldId];
      return value === undefined || value === null || value === "";
    });
    if (missing.length > 0) {
      // Full field records (not just id/label) so the frontend's move-stage
      // form can render the right input — a select for an enum field, a
      // date picker, etc — instead of falling back to plain text for
      // everything.
      const fields = await this.prisma.client.customField.findMany({ where: { id: { in: missing } } });
      throw new ConflictException({
        message: "Fill the required fields before moving to this stage",
        missingFields: fields
      });
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: lead.id },
        data: { stageId: stage.id, pipelineId: stage.pipelineId }
      });
      for (const [fieldId, value] of Object.entries(dto.fieldValues ?? {})) {
        await tx.leadFieldValue.upsert({
          where: { leadId_fieldId: { leadId: lead.id, fieldId } },
          update: { value: value as Prisma.InputJsonValue },
          create: { leadId: lead.id, fieldId, value: value as Prisma.InputJsonValue }
        });
      }
    });

    await this.audit.log({
      workspaceId,
      userId,
      action: stage.type === "open" ? "lead.stage_changed" : `lead.marked_${stage.type}`,
      entityType: "lead",
      entityId: lead.id,
      metadata: { stageId: stage.id, stageName: stage.name, pipelineId: stage.pipelineId }
    });

    return this.getById(workspaceId, lead.id);
  }

  async import(workspaceId: string, userId: string, dto: ImportLeadsDto) {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of dto.rows) {
      const existing = await this.findDuplicateBy(workspaceId, row.phone, row.email);
      if (existing) {
        if (dto.dedupeStrategy === "update") {
          await this.prisma.client.lead.update({
            where: { id: existing.id },
            data: { name: row.name ?? existing.name, phone: row.phone ?? existing.phone, email: row.email ?? existing.email }
          });
          updated++;
        } else {
          skipped++;
        }
        continue;
      }
      const lead = await this.prisma.client.lead.create({
        data: { workspaceId, name: row.name, phone: row.phone, email: row.email, source: "import" }
      });
      for (const tagName of row.tags ?? []) {
        const tag = await this.prisma.client.tag.upsert({
          where: { workspaceId_name: { workspaceId, name: tagName } },
          update: {},
          create: { workspaceId, name: tagName }
        });
        await this.prisma.client.leadTag.create({ data: { leadId: lead.id, tagId: tag.id } });
      }
      created++;
    }

    await this.audit.log({
      workspaceId,
      userId,
      action: "leads.imported",
      entityType: "lead",
      metadata: { created, updated, skipped }
    });
    return { created, updated, skipped };
  }

  private async ensureLead(workspaceId: string, leadId: string) {
    const lead = await this.prisma.client.lead.findFirst({ where: { id: leadId, workspaceId } });
    if (!lead) throw new NotFoundException("Lead not found");
    return lead;
  }
}
