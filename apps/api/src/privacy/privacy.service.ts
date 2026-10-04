import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@zenora/db";
import { DELETION_GRACE_DAYS, deletionDueAt, isValidMessageRetention } from "@zenora/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

// A person's data lives in many tables, and several of the links to Lead are
// optional (deleting the lead would just null them and leave the conversation
// and its messages behind). Erasure is therefore explicit and ordered, inside
// one transaction, rather than relying on cascades.
@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  // Everything Zenora holds about one person, as a downloadable record. Counts
  // as "access request" fulfilment; staff users' own details are not included.
  async exportLead(workspaceId: string, leadId: string, userId: string) {
    const lead = await this.prisma.client.lead.findFirst({
      where: { id: leadId, workspaceId },
      include: {
        identities: { select: { type: true, value: true } },
        tags: { select: { tag: { select: { name: true } } } },
        notes: { select: { body: true, createdAt: true }, orderBy: { createdAt: "asc" } },
        consents: { select: { type: true, granted: true, source: true, createdAt: true }, orderBy: { createdAt: "asc" } },
        fieldValues: { select: { value: true, field: { select: { label: true } } } },
        tasks: { select: { title: true, dueAt: true, completedAt: true, createdAt: true } },
        conversations: {
          select: { channel: true, createdAt: true, messages: { select: { direction: true, type: true, body: true, mediaUrl: true, createdAt: true }, orderBy: { createdAt: "asc" } } }
        }
      }
    });
    if (!lead) throw new NotFoundException("Lead not found");

    const appointments = await this.prisma.client.appointment.findMany({
      where: { workspaceId, leadId },
      select: { startsAt: true, endsAt: true, status: true, guestName: true, guestPhone: true, appointmentType: { select: { name: true } } }
    });

    await this.audit.log({ workspaceId, userId, action: "privacy.lead_exported", entityType: "lead", entityId: leadId });
    return {
      exportedAt: new Date().toISOString(),
      lead: {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        source: lead.source,
        createdAt: lead.createdAt,
        adReferral: lead.adReferral
      },
      identities: lead.identities,
      tags: lead.tags.map((t) => t.tag.name),
      customFields: lead.fieldValues.map((f) => ({ field: f.field.label, value: f.value })),
      notes: lead.notes,
      consents: lead.consents,
      tasks: lead.tasks,
      appointments: appointments.map((a) => ({ ...a, appointmentType: a.appointmentType.name })),
      conversations: lead.conversations
    };
  }

  // Permanently removes a person and the records that identify them. Returns
  // counts only — never the data that was removed.
  async eraseLead(workspaceId: string, leadId: string, userId: string) {
    const lead = await this.prisma.client.lead.findFirst({
      where: { id: leadId, workspaceId },
      select: { id: true, phone: true, email: true, identities: { select: { value: true } }, mergedFrom: { select: { id: true, phone: true, email: true, identities: { select: { value: true } } } } }
    });
    if (!lead) throw new NotFoundException("Lead not found");

    // Duplicates that were merged into this lead are the same person.
    const people = [lead, ...lead.mergedFrom];
    const leadIds = people.map((p) => p.id);
    const needles = [...new Set(people.flatMap((p) => [p.phone, p.email, ...p.identities.map((i) => i.value)]).filter((v): v is string => !!v && v.length >= 6))];

    const counts = await this.prisma.client.$transaction(async (tx) => {
      const conversations = await tx.conversation.findMany({ where: { workspaceId, leadId: { in: leadIds } }, select: { id: true } });
      const convIds = conversations.map((c) => c.id);

      const messages = await tx.message.deleteMany({ where: { conversationId: { in: convIds } } });
      await tx.conversation.deleteMany({ where: { id: { in: convIds } } });
      await tx.automationRun.deleteMany({ where: { leadId: { in: leadIds } } });
      const tasks = await tx.task.deleteMany({ where: { workspaceId, leadId: { in: leadIds } } });
      await tx.slaTimer.deleteMany({ where: { workspaceId, leadId: { in: leadIds } } });
      const appointments = await tx.appointment.deleteMany({ where: { workspaceId, leadId: { in: leadIds } } });

      // Webhook delivery logs keep a copy of what we sent about this person.
      const deliveries = await tx.webhookDelivery.deleteMany({
        where: {
          workspaceId,
          OR: leadIds.flatMap((id) => [{ payload: { path: ["data", "id"], equals: id } }, { payload: { path: ["data", "leadId"], equals: id } }])
        }
      });

      // Raw Meta webhook payloads that mention this person's phone / handle.
      // One statement for all of them: this runs inside a transaction against a remote database.
      const patterns = needles.map((n) => "%" + n.replace(/[\\%_]/g, "\\$&") + "%");
      const rawEvents = patterns.length ? await tx.$executeRaw(Prisma.sql`DELETE FROM "MetaWebhookEvent" WHERE payload::text LIKE ANY (${patterns}::text[])`) : 0;

      // Merged duplicates point at the primary lead, so they go first. Cascades
      // then remove identities, tags, notes, consents, field values and so on.
      await tx.lead.deleteMany({ where: { id: { in: leadIds.filter((id) => id !== leadId) } } });
      await tx.lead.delete({ where: { id: leadId } });

      return { leads: leadIds.length, conversations: convIds.length, messages: messages.count, tasks: tasks.count, appointments: appointments.count, webhookDeliveries: deliveries.count, rawEvents };
    }, { timeout: 30_000, maxWait: 10_000 }); // a dozen statements against a remote database outlast Prisma's 5s default

    // No personal data here: the lead id no longer resolves to anyone.
    await this.audit.log({ workspaceId, userId, action: "privacy.lead_erased", entityType: "lead", entityId: leadId, metadata: counts });
    return counts;
  }

  // --- deleting the whole workspace ---------------------------------------

  async deletionStatus(workspaceId: string) {
    const ws = await this.prisma.client.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { deletionScheduledAt: true } });
    return { scheduledFor: ws.deletionScheduledAt, graceDays: DELETION_GRACE_DAYS };
  }

  // Nothing is deleted now. The owner must type the workspace's exact name, and
  // the workspace is removed by the daily job once the grace period has passed
  // (cancellable until then). Invoices are copied aside at that point.
  async scheduleDeletion(workspaceId: string, userId: string, confirmName: string) {
    const ws = await this.prisma.client.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true, deletionScheduledAt: true } });
    if (ws.deletionScheduledAt) throw new BadRequestException("This workspace is already scheduled for deletion");
    if (confirmName.trim() !== ws.name) throw new BadRequestException("Type the workspace name exactly to confirm");
    const scheduledFor = deletionDueAt(new Date());
    await this.prisma.client.workspace.update({ where: { id: workspaceId }, data: { deletionScheduledAt: scheduledFor } });
    await this.audit.log({ workspaceId, userId, action: "privacy.workspace_deletion_scheduled", entityType: "workspace", entityId: workspaceId, metadata: { scheduledFor } });
    return { scheduledFor, graceDays: DELETION_GRACE_DAYS };
  }

  async cancelDeletion(workspaceId: string, userId: string) {
    const ws = await this.prisma.client.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { deletionScheduledAt: true } });
    if (!ws.deletionScheduledAt) throw new BadRequestException("This workspace is not scheduled for deletion");
    await this.prisma.client.workspace.update({ where: { id: workspaceId }, data: { deletionScheduledAt: null } });
    await this.audit.log({ workspaceId, userId, action: "privacy.workspace_deletion_cancelled", entityType: "workspace", entityId: workspaceId });
    return { scheduledFor: null, graceDays: DELETION_GRACE_DAYS };
  }

  async getRetention(workspaceId: string) {
    const ws = await this.prisma.client.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { messageRetentionDays: true } });
    return { messageRetentionDays: ws.messageRetentionDays };
  }

  async setRetention(workspaceId: string, userId: string, days: number | null) {
    if (!isValidMessageRetention(days)) throw new BadRequestException("Choose one of the offered retention periods");
    await this.prisma.client.workspace.update({ where: { id: workspaceId }, data: { messageRetentionDays: days } });
    await this.audit.log({ workspaceId, userId, action: "privacy.retention_changed", entityType: "workspace", entityId: workspaceId, metadata: { messageRetentionDays: days } });
    return { messageRetentionDays: days };
  }
}
