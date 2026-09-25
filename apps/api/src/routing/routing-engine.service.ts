import { Injectable, Logger } from "@nestjs/common";
import {
  computeScore,
  matchRoutingRule,
  pickLeastBusy,
  pickRoundRobin,
  type LeadRoutingContext,
  type RoutingCandidate,
  type RoutingRuleInput,
  type ScoringRuleInput
} from "@zenora/shared";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";

// Runs on every newly-created lead (docs/ROADMAP.md Phase 1 item 8): scores
// it against the workspace's rules, routes it to a salesperson (ordered
// rules, falling back to least-busy among available members), starts an SLA
// timer, and queues the WhatsApp alert — all best-effort so a routing/scoring
// hiccup never blocks lead creation itself.
@Injectable()
export class RoutingEngineService {
  private readonly logger = new Logger(RoutingEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService
  ) {}

  async applyToNewLead(workspaceId: string, leadId: string): Promise<void> {
    try {
      await this.run(workspaceId, leadId);
    } catch (err) {
      this.logger.error(`Routing/scoring failed for lead ${leadId}`, err instanceof Error ? err.stack : String(err));
    }
  }

  private async run(workspaceId: string, leadId: string): Promise<void> {
    const lead = await this.prisma.client.lead.findUnique({
      where: { id: leadId },
      include: { tags: { include: { tag: true } }, fieldValues: true }
    });
    if (!lead) return;

    const context: LeadRoutingContext = {
      source: lead.source,
      tags: lead.tags.map((t) => t.tag.name),
      customFieldValues: Object.fromEntries(lead.fieldValues.map((v) => [v.fieldId, String(v.value)]))
    };

    const [scoringRules, routingRules] = await Promise.all([
      this.prisma.client.scoringRule.findMany({ where: { workspaceId } }),
      this.prisma.client.routingRule.findMany({ where: { workspaceId }, orderBy: { order: "asc" } })
    ]);

    const score = computeScore(scoringRules as unknown as ScoringRuleInput[], context);
    if (score !== 0) {
      await this.prisma.client.lead.update({ where: { id: leadId }, data: { score } });
    }

    const assignTo = matchRoutingRule(routingRules as unknown as RoutingRuleInput[], context);
    const userId = await this.resolveAssignee(workspaceId, assignTo);
    if (!userId) {
      this.logger.warn(`No available member to route lead ${leadId} in workspace ${workspaceId}`);
      return;
    }

    await this.assign(workspaceId, leadId, userId, null);
  }

  // Shared by the initial routing pass and worker-side SLA reassignment.
  async assign(workspaceId: string, leadId: string, userId: string, reassignedFromId: string | null): Promise<void> {
    await this.prisma.client.$transaction([
      this.prisma.client.lead.update({ where: { id: leadId }, data: { ownerId: userId } }),
      this.prisma.client.assignment.create({ data: { leadId, userId, reassignedFromId } })
    ]);

    const workspace = await this.prisma.client.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const slaTimer = await this.prisma.client.slaTimer.create({
      data: { workspaceId, leadId, dueAt: new Date(Date.now() + workspace.slaMinutes * 60_000) }
    });

    await this.queue.add("routing", "salesperson_alert", { workspaceId, leadId, userId });
    await this.queue.add("routing", "sla_check", { slaTimerId: slaTimer.id }, workspace.slaMinutes * 60_000);
  }

  private async resolveAssignee(workspaceId: string, assignTo: ReturnType<typeof matchRoutingRule>): Promise<string | null> {
    if (assignTo?.type === "user" && assignTo.targetId) return assignTo.targetId;

    const teamId = assignTo?.type === "team" ? assignTo.targetId : undefined;
    const candidates = await this.availableCandidates(workspaceId, teamId);
    if (candidates.length === 0) return null;

    if (assignTo?.type === "round_robin") {
      const totalAssignments = await this.prisma.client.assignment.count({ where: { lead: { workspaceId } } });
      return pickRoundRobin(candidates, totalAssignments);
    }
    // "least_busy", "team", or no match at all (fallback) all resolve the same way.
    return pickLeastBusy(candidates);
  }

  private async availableCandidates(workspaceId: string, teamId?: string): Promise<RoutingCandidate[]> {
    const members = await this.prisma.client.membership.findMany({
      where: { workspaceId, available: true, ...(teamId ? { teamId } : {}) }
    });
    return Promise.all(
      members.map(async (m) => ({
        userId: m.userId,
        openLeadCount: await this.prisma.client.lead.count({
          where: { workspaceId, ownerId: m.userId, mergedIntoId: null, OR: [{ stageId: null }, { stage: { type: "open" } }] }
        })
      }))
    );
  }
}
