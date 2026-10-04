import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // Snapshot of leads currently in each stage — not a historical
  // conversion funnel, since there's no stage-transition history table
  // (docs/PROGRESS.md simplification). Still shows where leads pile up.
  async pipelineFunnel(workspaceId: string, pipelineId?: string) {
    const pipeline = pipelineId
      ? await this.prisma.client.pipeline.findFirst({ where: { id: pipelineId, workspaceId } })
      : await this.prisma.client.pipeline.findFirst({ where: { workspaceId }, orderBy: { isDefault: "desc" } });
    if (!pipeline) throw new NotFoundException("Pipeline not found");

    const stages = await this.prisma.client.stage.findMany({
      where: { pipelineId: pipeline.id },
      orderBy: { order: "asc" }
    });

    const stageCounts = await Promise.all(
      stages.map((s) => this.prisma.client.lead.count({ where: { stageId: s.id, mergedIntoId: null } }))
    );

    return {
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      stages: stages.map((s, i) => ({ stageId: s.id, name: s.name, type: s.type, count: stageCounts[i] }))
    };
  }

  // Workspace-wide version of automations.service.ts's per-automation
  // `stats()` — same groupBy shape, scoped by workspace instead of one
  // automation id, so it reads across every bot at once.
  async botDropoff(workspaceId: string) {
    const [runsByStatus, steps] = await Promise.all([
      this.prisma.client.automationRun.groupBy({
        by: ["status"],
        where: { automation: { workspaceId } },
        _count: true
      }),
      this.prisma.client.runStep.groupBy({
        by: ["blockId", "type", "status"],
        where: { run: { automation: { workspaceId } } },
        _count: true
      })
    ]);

    return {
      runsByStatus: runsByStatus.map((r) => ({ status: r.status, count: r._count })),
      stepFunnel: steps.map((s) => ({ blockId: s.blockId, type: s.type, status: s.status, count: s._count }))
    };
  }

  // SlaTimer has no Prisma relation to Lead (only a raw leadId column), so
  // the owner join happens in application code rather than a Prisma
  // `include`.
  async teamPerformance(workspaceId: string) {
    const [members, leads, timers] = await Promise.all([
      this.prisma.client.membership.findMany({
        where: { workspaceId },
        include: { user: { select: { id: true, name: true, email: true } } }
      }),
      this.prisma.client.lead.findMany({
        where: { workspaceId, mergedIntoId: null },
        select: { id: true, ownerId: true, stage: { select: { type: true } } }
      }),
      this.prisma.client.slaTimer.findMany({
        where: { workspaceId, resolvedAt: { not: null } },
        select: { leadId: true, createdAt: true, resolvedAt: true }
      })
    ]);

    const leadById = new Map(leads.map((l) => [l.id, l]));

    interface Bucket {
      totalLeads: number;
      won: number;
      lost: number;
      responseMinutes: number[];
    }
    const byOwner = new Map<string, Bucket>();
    const bucket = (userId: string): Bucket => {
      let b = byOwner.get(userId);
      if (!b) {
        b = { totalLeads: 0, won: 0, lost: 0, responseMinutes: [] };
        byOwner.set(userId, b);
      }
      return b;
    };

    for (const lead of leads) {
      if (!lead.ownerId) continue;
      const b = bucket(lead.ownerId);
      b.totalLeads += 1;
      if (lead.stage?.type === "won") b.won += 1;
      if (lead.stage?.type === "lost") b.lost += 1;
    }

    for (const timer of timers) {
      const lead = leadById.get(timer.leadId);
      if (!lead?.ownerId || !timer.resolvedAt) continue;
      bucket(lead.ownerId).responseMinutes.push((timer.resolvedAt.getTime() - timer.createdAt.getTime()) / 60_000);
    }

    return members.map((m) => {
      const b = byOwner.get(m.userId);
      const avgResponseMinutes =
        b && b.responseMinutes.length > 0
          ? Math.round(b.responseMinutes.reduce((sum, v) => sum + v, 0) / b.responseMinutes.length)
          : null;
      return {
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        totalLeads: b?.totalLeads ?? 0,
        won: b?.won ?? 0,
        lost: b?.lost ?? 0,
        avgResponseMinutes
      };
    });
  }

  async lostReasons(workspaceId: string) {
    // Counted by the database, so the number of lost leads does not matter.
    const grouped = await this.prisma.client.lead.groupBy({
      by: ["lostReason"],
      where: { workspaceId, mergedIntoId: null, stage: { type: "lost" } },
      _count: { _all: true }
    });

    const counts = new Map<string, number>();
    for (const row of grouped) {
      const reason = row.lostReason?.trim() || "No reason given";
      counts.set(reason, (counts.get(reason) ?? 0) + row._count._all);
    }

    return [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  }
}
