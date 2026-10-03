import { prisma } from "@zenora/db";
import {
  isTriggerAllowedToFire,
  matchesCondition,
  triggerDelayMs,
  type KeywordTriggerConfig,
  type LeadRoutingContext,
  type RoutingCondition,
  type TriggerLimits,
  type TriggerType
} from "@zenora/shared";

interface StoredTriggerConfig extends KeywordTriggerConfig {
  conditions?: RoutingCondition[];
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
    const conditions = configOf(a).conditions;
    if (!conditions || conditions.length === 0) return true;
    return context !== null && conditions.every((c) => matchesCondition(c, context));
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
