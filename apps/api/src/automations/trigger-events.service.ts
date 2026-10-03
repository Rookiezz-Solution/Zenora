import { Injectable } from "@nestjs/common";
import {
  isTriggerAllowedToFire,
  matchesCondition,
  triggerDelayMs,
  type LeadRoutingContext,
  type RoutingCondition,
  type TagAddedTriggerConfig,
  type TriggerLimits
} from "@zenora/shared";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";

interface StoredTagAddedConfig extends TagAddedTriggerConfig {
  conditions?: RoutingCondition[];
  limits?: TriggerLimits;
}

// The API-side twin of apps/worker's message-keyword trigger-matcher — CRM
// events (docs/PRD.md's custom trigger builder) originate from API actions
// (LeadsService.addTag) rather than a webhook, so matching happens here
// instead of the worker. Enqueues the same automation-engine "start" job
// apps/worker's message processors already use; the worker doesn't care
// who produced the job.
@Injectable()
export class TriggerEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService
  ) {}

  async fireTagAdded(workspaceId: string, leadId: string, tagName: string): Promise<void> {
    const candidates = await this.prisma.client.automation.findMany({
      where: { workspaceId, status: "live", trigger: { type: "tag_added" } },
      include: { trigger: true, versions: { where: { publishedAt: { not: null } }, orderBy: { version: "desc" }, take: 1 } }
    });

    const typeMatched = candidates.filter((a) => {
      const config = a.trigger?.config as unknown as StoredTagAddedConfig | undefined;
      return config && a.versions[0] && (!config.tagName || config.tagName === tagName);
    });
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
      const config = a.trigger?.config as unknown as StoredTagAddedConfig;
      return !config.conditions || config.conditions.length === 0 || config.conditions.every((c) => matchesCondition(c, context));
    });
    if (conditionMatched.length === 0) return;

    const runs = await this.prisma.client.automationRun.findMany({
      where: { automationId: { in: conditionMatched.map((a) => a.id) }, leadId },
      select: { automationId: true, status: true }
    });

    const allowed = conditionMatched.filter((a) => {
      const config = a.trigger?.config as unknown as StoredTagAddedConfig;
      return isTriggerAllowedToFire(a.id, config.limits, runs);
    });
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
      const config = automation.trigger?.config as unknown as StoredTagAddedConfig;
      await this.queue.add(
        "automation-engine",
        "start",
        { automationId: automation.id, leadId, conversationId: conversation.id },
        triggerDelayMs(config.limits)
      );
    }
  }
}
