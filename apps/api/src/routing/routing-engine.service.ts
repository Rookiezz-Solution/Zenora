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
import { TriggerEventsService } from "../automations/trigger-events.service";
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
    private readonly queue: QueueService,
    private readonly triggers: TriggerEventsService
  ) {}

  async applyToNewLead(workspaceId: string, leadId: string): Promise<void> {
    try {
      await this.run(workspaceId, leadId);
    } catch (err) {
      this.logger.error(`Routing/scoring failed for lead ${leadId}`, err instanceof Error ? err.stack : String(err));
    }
  }

  private async run(workspaceId: string, leadId: string): Promise<void> {
    // Everything this pass needs to read is independent, so it is read together
    // (one network round trip, not five): the lead, the rules, who is available
    // to take it, and the workspace's SLA length.
    const [lead, scoringRules, routingRules, members, workspace] = await Promise.all([
      this.prisma.client.lead.findUnique({ where: { id: leadId }, include: { tags: { include: { tag: true } }, fieldValues: true } }),
      this.prisma.client.scoringRule.findMany({ where: { workspaceId } }),
      this.prisma.client.routingRule.findMany({ where: { workspaceId }, orderBy: { order: "asc" } }),
      this.prisma.client.membership.findMany({ where: { workspaceId, available: true } }),
      this.prisma.client.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { slaMinutes: true } })
    ]);
    if (!lead) return;

    const context: LeadRoutingContext = {
      source: lead.source,
      tags: lead.tags.map((t) => t.tag.name),
      customFieldValues: Object.fromEntries(lead.fieldValues.map((v) => [v.fieldId, String(v.value)]))
    };

    const score = computeScore(scoringRules as unknown as ScoringRuleInput[], context);
    if (score !== 0) {
      // A brand-new lead has no aiIntentScore yet, so score == ruleScore here.
      await this.prisma.client.lead.update({ where: { id: leadId }, data: { ruleScore: score, score } });
      await this.triggers.fireScoreChanged(workspaceId, leadId, lead.score, score).catch(() => undefined);
    }

    const assignTo = matchRoutingRule(routingRules as unknown as RoutingRuleInput[], context);
    const userId = await this.resolveAssignee(workspaceId, assignTo, members);
    if (!userId) {
      this.logger.warn(`No available member to route lead ${leadId} in workspace ${workspaceId}`);
      return;
    }

    await this.assign(workspaceId, leadId, userId, null, workspace.slaMinutes);
  }

  // Shared by the initial routing pass and worker-side SLA reassignment.
  async assign(workspaceId: string, leadId: string, userId: string, reassignedFromId: string | null, knownSlaMinutes?: number): Promise<void> {
    const [slaMinutes] = await Promise.all([
      knownSlaMinutes ?? this.prisma.client.workspace.findUniqueOrThrow({ where: { id: workspaceId } }).then((w) => w.slaMinutes),
      this.prisma.client.$transaction([
        this.prisma.client.lead.update({ where: { id: leadId }, data: { ownerId: userId } }),
        this.prisma.client.assignment.create({ data: { leadId, userId, reassignedFromId } })
      ])
    ]);

    // The alert doesn't depend on the timer, so they go out together.
    await Promise.all([
      this.queue.add("routing", "salesperson_alert", { workspaceId, leadId, userId }),
      this.prisma.client.slaTimer
        .create({ data: { workspaceId, leadId, dueAt: new Date(Date.now() + slaMinutes * 60_000) } })
        .then((timer) => this.queue.add("routing", "sla_check", { slaTimerId: timer.id }, slaMinutes * 60_000))
    ]);
  }

  private async resolveAssignee(
    workspaceId: string,
    assignTo: ReturnType<typeof matchRoutingRule>,
    availableMembers: { userId: string; teamId: string | null }[]
  ): Promise<string | null> {
    if (assignTo?.type === "user" && assignTo.targetId) return assignTo.targetId;

    const teamId = assignTo?.type === "team" ? assignTo.targetId : undefined;
    const members = teamId ? availableMembers.filter((m) => m.teamId === teamId) : availableMembers;
    const candidates = await this.withOpenLeadCounts(workspaceId, members);
    if (candidates.length === 0) return null;

    if (assignTo?.type === "round_robin") {
      const totalAssignments = await this.prisma.client.assignment.count({ where: { lead: { workspaceId } } });
      return pickRoundRobin(candidates, totalAssignments);
    }
    // "least_busy", "team", or no match at all (fallback) all resolve the same way.
    return pickLeastBusy(candidates);
  }

  private async withOpenLeadCounts(workspaceId: string, members: { userId: string }[]): Promise<RoutingCandidate[]> {
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
