import { prisma } from "@zenora/db";
import type { KeywordTriggerConfig, TriggerType } from "@zenora/shared";

function matches(config: KeywordTriggerConfig, text: string): boolean {
  if (config.matchType === "any") return true;
  const lower = text.toLowerCase();
  return config.keywords.some((k) => {
    const kw = k.toLowerCase();
    return config.matchType === "exact" ? lower === kw : lower.includes(kw);
  });
}

// Finds live automations on this workspace/channel whose keyword trigger
// matches the message, skipping any that already have a run in progress for
// this lead (docs/PRD.md's "once per person" — a simplified version: this
// guards against re-triggering mid-flow rather than tracking a full
// per-lead-per-automation history).
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

  const matched = candidates.filter((automation) => {
    const config = automation.trigger?.config as unknown as KeywordTriggerConfig | undefined;
    return config && automation.versions[0] && matches(config, messageText);
  });

  if (matched.length === 0) return [];

  const alreadyRunning = await prisma.automationRun.findMany({
    where: { automationId: { in: matched.map((m) => m.id) }, leadId, status: "running" },
    select: { automationId: true }
  });
  const runningIds = new Set(alreadyRunning.map((r) => r.automationId));

  return matched.filter((m) => !runningIds.has(m.id));
}
