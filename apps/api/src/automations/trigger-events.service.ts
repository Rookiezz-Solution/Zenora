import { Injectable } from "@nestjs/common";
import {
  conditionsPass,
  isTriggerAllowedToFire,
  matchesCrmEvent,
  triggerDelayMs,
  type ConditionMode,
  type CrmEvent,
  type CrmEventType,
  type LeadRoutingContext,
  type RoutingCondition,
  type TriggerLimits
} from "@zenora/shared";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";

type StoredConfig = Record<string, unknown> & {
  conditions?: RoutingCondition[];
  conditionMode?: ConditionMode;
  limits?: TriggerLimits;
};

// The API-side twin of apps/worker's message-keyword trigger-matcher — CRM
// events (docs/PRD.md's custom trigger builder) originate from API actions
// (a tag added, a stage change, a score update) rather than a webhook, so
// matching happens here instead of the worker. Enqueues the same
// automation-engine "start" job apps/worker's message processors already use;
// the worker doesn't care who produced the job.
@Injectable()
export class TriggerEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService
  ) {}

  fireTagAdded(workspaceId: string, leadId: string, tagName: string): Promise<void> {
    return this.fire(workspaceId, leadId, "tag_added", { tagName });
  }

  fireStageChanged(workspaceId: string, leadId: string, stageId: string): Promise<void> {
    return this.fire(workspaceId, leadId, "stage_changed", { stageId });
  }

  // Raised whenever a lead's score changes; only a rise across a trigger's
  // threshold starts anything.
  fireScoreChanged(workspaceId: string, leadId: string, scoreBefore: number, scoreAfter: number): Promise<void> {
    if (scoreAfter <= scoreBefore) return Promise.resolve();
    return this.fire(workspaceId, leadId, "score_reached", { scoreBefore, scoreAfter });
  }

  private async fire(workspaceId: string, leadId: string, type: CrmEventType, event: CrmEvent): Promise<void> {
    const candidates = await this.prisma.client.automation.findMany({
      where: { workspaceId, status: "live", trigger: { type } },
      include: { trigger: true, versions: { where: { publishedAt: { not: null } }, orderBy: { version: "desc" }, take: 1 } }
    });

    const configOf = (a: { trigger: { config: unknown } | null }) => a.trigger?.config as unknown as StoredConfig | undefined;

    const typeMatched = candidates.filter((a) => a.versions[0] && matchesCrmEvent(type, configOf(a), event));
    if (typeMatched.length === 0) return;

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

    const conditionMatched = typeMatched.filter((a) => {
      const config = configOf(a)!;
      return conditionsPass(config.conditions, config.conditionMode, context);
    });
    if (conditionMatched.length === 0) return;

    const runs = await this.prisma.client.automationRun.findMany({
      where: { automationId: { in: conditionMatched.map((a) => a.id) }, leadId },
      select: { automationId: true, status: true }
    });

    const allowed = conditionMatched.filter((a) => isTriggerAllowedToFire(a.id, configOf(a)!.limits, runs));
    if (allowed.length === 0) return;

    // A flow that sends messages needs a conversation to send through — a
    // manually-added lead with no channel contact yet has none, so this
    // skips rather than starting a run with nowhere to send (docs/PROGRESS.md
    // simplification).
    const conversation = await this.prisma.client.conversation.findFirst({
      where: { workspaceId, leadId },
      orderBy: { updatedAt: "desc" }
    });
    if (!conversation) return;

    for (const automation of allowed) {
      await this.queue.add(
        "automation-engine",
        "start",
        { automationId: automation.id, leadId, conversationId: conversation.id },
        triggerDelayMs(configOf(automation)!.limits)
      );
    }
  }
}
