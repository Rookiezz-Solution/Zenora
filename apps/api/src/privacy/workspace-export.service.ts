import { Injectable, Logger } from "@nestjs/common";
import type { Response } from "express";
import { AuditService } from "../audit/audit.service";
import { RateLimiter } from "../common/rate-limiter";
import { PrismaService } from "../prisma/prisma.service";

const PAGE = 500;

// "Download everything": the business's own data as one JSON file, written to
// the response in batches so a large workspace never sits in memory at once.
//
// Deliberately left out: anything secret (channel and calendar tokens, API key
// hashes, webhook signing secrets, ad-account tokens) and other people's
// accounts (only a member's name, email and role are included).
@Injectable()
export class WorkspaceExportService {
  // Building the file is heavy; one per workspace every ten minutes is plenty.
  private readonly limiter = new RateLimiter(1, 10 * 60_000, "workspace-export");
  private readonly logger = new Logger(WorkspaceExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async stream(workspaceId: string, userId: string, res: Response): Promise<void> {
    await this.limiter.consume(workspaceId);

    const workspace = await this.prisma.client.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { id: true, name: true, mode: true, industry: true, timezone: true, currency: true, labels: true, billingName: true, gstin: true, billingAddress: true, createdAt: true }
    });

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="zenora-export-${workspaceId}.json"`);
    res.setHeader("Cache-Control", "no-store");
    res.write(`{"exportedAt":${JSON.stringify(new Date().toISOString())},"workspace":${JSON.stringify(workspace)}`);

    const counts: Record<string, number> = {};
    try {
      await this.writeSections(workspaceId, res, counts);
    } catch (err) {
      // Headers and part of the file are already sent: end the connection
      // abnormally so the download fails instead of looking like a complete
      // (but truncated, invalid) file.
      this.logger.error(`Workspace export failed part-way: ${err instanceof Error ? err.message : String(err)}`);
      res.destroy();
      return;
    }
    res.write("}");
    res.end();
    await this.audit.log({ workspaceId, userId, action: "privacy.workspace_exported", entityType: "workspace", entityId: workspaceId, metadata: counts });
  }

  private async writeSections(workspaceId: string, res: Response, counts: Record<string, number>): Promise<void> {
    const section = async (name: string, page: (cursor: string | undefined) => Promise<{ id: string }[]>) => {
      res.write(`,${JSON.stringify(name)}:[`);
      let cursor: string | undefined;
      let n = 0;
      for (;;) {
        const rows = await page(cursor);
        for (const row of rows) res.write(`${n++ ? "," : ""}${JSON.stringify(row)}`);
        if (rows.length < PAGE) break;
        cursor = rows[rows.length - 1]!.id;
      }
      res.write("]");
      counts[name] = n;
    };
    const paged = (cursor: string | undefined) => ({ take: PAGE, orderBy: { id: "asc" as const }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    const c = this.prisma.client;

    await section("members", async (cur) =>
      (await c.membership.findMany({ where: { workspaceId }, ...paged(cur), select: { id: true, role: true, createdAt: true, user: { select: { name: true, email: true } } } })).map((m) => ({ ...m, id: m.id }))
    );
    await section("pipelines", (cur) => c.pipeline.findMany({ where: { workspaceId }, ...paged(cur), include: { stages: { orderBy: { order: "asc" } } } }));
    await section("tags", (cur) => c.tag.findMany({ where: { workspaceId }, ...paged(cur) }));
    await section("customFields", (cur) => c.customField.findMany({ where: { workspaceId }, ...paged(cur) }));
    await section("leads", async (cur) => {
      const leads = await c.lead.findMany({
        where: { workspaceId, mergedIntoId: null },
        ...paged(cur),
        include: {
          identities: { select: { type: true, value: true } },
          tags: { select: { tag: { select: { name: true } } } },
          notes: { select: { body: true, createdAt: true }, orderBy: { createdAt: "asc" } },
          consents: { select: { type: true, granted: true, source: true, createdAt: true }, orderBy: { createdAt: "asc" } },
          fieldValues: { select: { value: true, field: { select: { label: true } } } }
        }
      });
      return leads.map(({ tags, fieldValues, ...lead }) => ({ ...lead, tags: tags.map((t) => t.tag.name), customFields: fieldValues.map((f) => ({ field: f.field.label, value: f.value })) }));
    });
    await section("conversations", (cur) =>
      c.conversation.findMany({
        where: { workspaceId },
        ...paged(cur),
        select: { id: true, leadId: true, channel: true, createdAt: true, messages: { orderBy: { createdAt: "asc" }, select: { direction: true, type: true, body: true, mediaUrl: true, createdAt: true } } }
      })
    );
    await section("tasks", (cur) => c.task.findMany({ where: { workspaceId }, ...paged(cur) }));
    await section("appointments", (cur) => c.appointment.findMany({ where: { workspaceId }, ...paged(cur), select: { id: true, leadId: true, startsAt: true, endsAt: true, status: true, guestName: true, guestPhone: true, createdAt: true } }));
    await section("automations", (cur) => c.automation.findMany({ where: { workspaceId }, ...paged(cur), include: { versions: { orderBy: { version: "desc" }, take: 1, select: { version: true, graph: true, publishedAt: true } } } }));
    await section("sequences", (cur) => c.sequence.findMany({ where: { workspaceId }, ...paged(cur) }));
    await section("whatsappTemplates", (cur) => c.waTemplate.findMany({ where: { workspaceId }, ...paged(cur) }));
    await section("broadcasts", (cur) => c.broadcast.findMany({ where: { workspaceId }, ...paged(cur), select: { id: true, templateId: true, audienceFilter: true, scheduledAt: true, status: true, sentAt: true, createdAt: true } }));
    await section("flowTemplates", (cur) => c.flowTemplate.findMany({ where: { workspaceId }, ...paged(cur), select: { id: true, name: true, industry: true, scope: true, graph: true, createdAt: true } }));
    await section("knowledgeSources", (cur) => c.knowledgeSource.findMany({ where: { workspaceId }, ...paged(cur), select: { id: true, type: true, name: true, content: true, sourceUrl: true, createdAt: true } }));
    await section("faqs", (cur) => c.faq.findMany({ where: { workspaceId }, ...paged(cur), select: { id: true, question: true, answer: true, createdAt: true } }));
    await section("invoices", (cur) => c.invoice.findMany({ where: { workspaceId }, ...paged(cur), select: { id: true, description: true, amountInr: true, gstInr: true, status: true, periodStart: true, periodEnd: true, issuedAt: true } }));
  }
}
