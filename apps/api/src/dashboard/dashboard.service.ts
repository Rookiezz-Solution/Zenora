import { Injectable } from "@nestjs/common";
import { isWaitingForReply, medianSpeedToLeadMinutes, percentChange, type ThreadMessage } from "@zenora/shared";
import { UsageService } from "../billing/usage.service";
import { PrismaService } from "../prisma/prisma.service";

const DAY_MS = 86_400_000;
const THREAD_CAP = 300;

// What the owner sees first: how many new enquiries, how fast they were
// answered, what is waiting, what needs doing today. Everything is independent,
// so it is read in one parallel batch.
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService
  ) {}

  async summary(workspaceId: string, days: number) {
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY_MS);
    const before = new Date(since.getTime() - days * DAY_MS);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const c = this.prisma.client;
    const lead = { workspaceId, mergedIntoId: null };

    // Two waves of a handful of queries each, not twenty at once: a cold pool
    // against a remote database copes badly with a burst, and a failure in one
    // query would otherwise take the whole page down with it.
    const [newLeads, previousLeads, won, sources, stageCounts, threads, openThreads, stages] = await Promise.all([
      c.lead.count({ where: { ...lead, createdAt: { gte: since } } }),
      c.lead.count({ where: { ...lead, createdAt: { gte: before, lt: since } } }),
      c.lead.count({ where: { ...lead, stage: { type: "won" }, updatedAt: { gte: since } } }),
      c.lead.groupBy({ by: ["source"], where: { ...lead, createdAt: { gte: since } }, _count: { _all: true } }),
      c.lead.groupBy({ by: ["stageId"], where: lead, _count: { _all: true } }),
      c.conversation.findMany({
        where: { workspaceId, createdAt: { gte: since } },
        select: { messages: { select: { direction: true, createdAt: true } } },
        orderBy: { createdAt: "desc" },
        take: THREAD_CAP
      }),
      c.conversation.findMany({
        where: { workspaceId, updatedAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
        select: { messages: { select: { direction: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { updatedAt: "desc" },
        take: THREAD_CAP
      }),
      c.stage.findMany({ where: { pipeline: { workspaceId } }, orderBy: [{ pipelineId: "asc" }, { order: "asc" }], select: { id: true, name: true, type: true } })
    ]);
    const weekAhead = new Date(now.getTime() + 7 * DAY_MS);
    const [openTasks, bookings, broadcasts, credits] = await Promise.all([
      c.task.findMany({ where: { workspaceId, completedAt: null }, select: { dueAt: true }, take: 5000 }),
      c.appointment.findMany({
        where: { workspaceId, status: "booked", startsAt: { gte: now, lte: weekAhead } },
        orderBy: { startsAt: "asc" },
        take: 200,
        select: { id: true, startsAt: true, guestName: true, appointmentType: { select: { name: true } } }
      }),
      c.broadcast.aggregate({ where: { workspaceId, sentAt: { gte: since } }, _sum: { costEstimate: true }, _count: { _all: true } }),
      this.usage.aiCreditsSummary(workspaceId)
    ]);
    const tasksOverdue = openTasks.filter((t) => t.dueAt && t.dueAt < now).length;
    const tasksToday = openTasks.filter((t) => t.dueAt && t.dueAt >= now && t.dueAt <= endOfToday).length;

    const asThread = (messages: { direction: string; createdAt: Date }[]): ThreadMessage[] => messages.map((m) => ({ direction: m.direction as "inbound" | "outbound", createdAt: m.createdAt }));
    const counts = new Map(stageCounts.map((s) => [s.stageId, s._count._all]));

    return {
      days,
      newLeads: { current: newLeads, previous: previousLeads, changePct: percentChange(newLeads, previousLeads) },
      won,
      speedToLeadMinutes: medianSpeedToLeadMinutes(threads.map((t) => asThread(t.messages))),
      waitingForReply: openThreads.filter((t) => isWaitingForReply(asThread(t.messages))).length,
      tasks: { open: openTasks.length, overdue: tasksOverdue, dueToday: tasksToday },
      appointments: { next7Days: bookings.length, upcoming: bookings.slice(0, 5) },
      sources: sources.map((s) => ({ source: s.source ?? "unknown", leads: s._count._all })).sort((a, b) => b.leads - a.leads),
      pipeline: stages.map((s) => ({ id: s.id, name: s.name, type: s.type, leads: counts.get(s.id) ?? 0 })),
      // An estimate of what Meta will bill the business directly for broadcasts: Zenora never charges it.
      whatsappSpendInr: Math.round((broadcasts._sum.costEstimate ?? 0) / 100),
      broadcastsSent: broadcasts._count._all,
      aiCredits: credits
    };
  }
}
