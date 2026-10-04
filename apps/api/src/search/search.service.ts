import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const PER_GROUP = 5;

// The Ctrl K search: a few matches from each place someone might be looking,
// always inside the caller's own workspace.
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(workspaceId: string, rawQuery: string) {
    const q = rawQuery.trim();
    if (q.length < 2) return { query: q, leads: [], automations: [], flowTemplates: [], tasks: [], notes: [] };
    const contains = { contains: q, mode: "insensitive" as const };
    const digits = q.replace(/\D/g, "");
    const c = this.prisma.client;

    const [leads, automations, flowTemplates, tasks, notes] = await Promise.all([
      c.lead.findMany({
        where: {
          workspaceId,
          mergedIntoId: null,
          OR: [{ name: contains }, { email: contains }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []), { tags: { some: { tag: { name: contains } } } }]
        },
        select: { id: true, name: true, phone: true, email: true },
        orderBy: { updatedAt: "desc" },
        take: PER_GROUP
      }),
      c.automation.findMany({ where: { workspaceId, name: contains }, select: { id: true, name: true, status: true }, take: PER_GROUP }),
      c.flowTemplate.findMany({ where: { workspaceId, name: contains }, select: { id: true, name: true }, take: PER_GROUP }),
      c.task.findMany({ where: { workspaceId, title: contains }, select: { id: true, title: true, leadId: true, completedAt: true }, orderBy: { createdAt: "desc" }, take: PER_GROUP }),
      c.note.findMany({ where: { body: contains, lead: { workspaceId, mergedIntoId: null } }, select: { id: true, body: true, leadId: true, lead: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: PER_GROUP })
    ]);

    return {
      query: q,
      leads,
      automations,
      flowTemplates,
      tasks,
      // A short excerpt around the match, never the whole note.
      notes: notes.map((n) => ({ id: n.id, leadId: n.leadId, leadName: n.lead.name, excerpt: excerpt(n.body, q) }))
    };
  }
}

export function excerpt(body: string, query: string): string {
  const at = body.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return body.slice(0, 80);
  const start = Math.max(0, at - 30);
  return `${start > 0 ? "…" : ""}${body.slice(start, at + query.length + 50)}${at + query.length + 50 < body.length ? "…" : ""}`;
}
