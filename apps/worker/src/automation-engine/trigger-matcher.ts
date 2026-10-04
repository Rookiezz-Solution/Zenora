import { prisma } from "@zenora/db";
import {
  conditionsPass,
  isTriggerAllowedToFire,
  matchesCrmEvent,
  triggerDelayMs,
  type ConditionMode,
  type CrmEvent,
  type CrmEventType,
  type KeywordTriggerConfig,
  type LeadRoutingContext,
  type RoutingCondition,
  type TriggerLimits,
  type TriggerType
} from "@zenora/shared";

interface StoredTriggerConfig extends KeywordTriggerConfig {
  conditions?: RoutingCondition[];
  conditionMode?: ConditionMode;
  limits?: TriggerLimits;
}

function matches(config: KeywordTriggerConfig, text: string): boolean {
  if (config.matchType === "any") return true;
  const lower = text.toLowerCase();
  return config.keywords.some((k) => {
    const kw = k.toLowerCase();
    return config.matchType === "exact" ? lower === kw : lower.includes(kw);
  });
}

async function buildLeadContext(leadId: string): Promise<LeadRoutingContext> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { tags: { include: { tag: true } }, fieldValues: true }
  });
  return {
    source: lead?.source ?? null,
    tags: lead?.tags.map((t) => t.tag.name) ?? [],
    customFieldValues: Object.fromEntries((lead?.fieldValues ?? []).map((v) => [v.fieldId, String(v.value)]))
  };
}

// Finds live automations on this workspace/channel whose keyword trigger
// matches the message, then applies the custom trigger builder's extra
// AND-ed conditions and limits (docs/PRD.md): onceForLead (never re-fire,
// even after a completed run) or, by default, skip only while a run is in
// progress. Each match carries `delayMs` from the trigger's delay limit.
export async function findMatchingAutomations(
  workspaceId: string,
  triggerType: TriggerType,
  messageText: string,
  leadId: string
) {
  const candidates = await prisma.automation.findMany({
    where: { workspaceId, status: "live", trigger: { type: triggerType } },
    include: { trigger: true, versions: { where: { publishedAt: { not: null } }, orderBy: { version: "desc" }, take: 1 } }
  });

  const configOf = (a: { trigger: { config: unknown } | null }) => a.trigger?.config as unknown as StoredTriggerConfig;

  const keywordMatched = candidates.filter((automation) => {
    const config = configOf(automation);
    return config && automation.versions[0] && matches(config, messageText);
  });
  if (keywordMatched.length === 0) return [];

  const needsContext = keywordMatched.some((a) => (configOf(a).conditions?.length ?? 0) > 0);
  const context = needsContext ? await buildLeadContext(leadId) : null;

  const conditionMatched = keywordMatched.filter((a) => {
    const { conditions, conditionMode } = configOf(a);
    if (!conditions || conditions.length === 0) return true;
    return context !== null && conditionsPass(conditions, conditionMode, context);
  });
  if (conditionMatched.length === 0) return [];

  const runs = await prisma.automationRun.findMany({
    where: { automationId: { in: conditionMatched.map((m) => m.id) }, leadId },
    select: { automationId: true, status: true }
  });

  return conditionMatched
    .filter((a) => isTriggerAllowedToFire(a.id, configOf(a).limits, runs))
    .map((a) => ({ ...a, delayMs: triggerDelayMs(configOf(a).limits) }));
}

// Automations started by something that happened to a lead (a score reaching a
// level), found the same way as for a message: the trigger matches the event,
// its extra conditions hold, and its limits allow another run. The API has a
// twin of this for the events it raises (apps/api trigger-events.service.ts).
export async function findCrmEventAutomations(workspaceId: string, leadId: string, type: CrmEventType, event: CrmEvent) {
  const candidates = await prisma.automation.findMany({
    where: { workspaceId, status: "live", trigger: { type } },
    include: { trigger: true, versions: { where: { publishedAt: { not: null } }, orderBy: { version: "desc" }, take: 1 } }
  });
  const configOf = (a: { trigger: { config: unknown } | null }) => a.trigger?.config as unknown as StoredTriggerConfig | undefined;

  const typeMatched = candidates.filter((a) => a.versions[0] && matchesCrmEvent(type, configOf(a) as unknown as Record<string, unknown>, event));
  if (typeMatched.length === 0) return [];

  const context = await buildLeadContext(leadId);
  const conditionMatched = typeMatched.filter((a) => conditionsPass(configOf(a)!.conditions, configOf(a)!.conditionMode, context));
  if (conditionMatched.length === 0) return [];

  const runs = await prisma.automationRun.findMany({
    where: { automationId: { in: conditionMatched.map((m) => m.id) }, leadId },
    select: { automationId: true, status: true }
  });
  return conditionMatched.filter((a) => isTriggerAllowedToFire(a.id, configOf(a)!.limits, runs)).map((a) => ({ ...a, delayMs: triggerDelayMs(configOf(a)!.limits) }));
}
