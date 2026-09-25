import { prisma } from "@zenora/db";
import {
  computeScore,
  matchRoutingRule,
  pickLeastBusy,
  pickRoundRobin,
  type AssignTo,
  type LeadRoutingContext,
  type RoutingCandidate,
  type RoutingRuleInput,
  type ScoringRuleInput
} from "@zenora/shared";
import { decryptToken } from "../decrypt-token";
import { sendWhatsappText } from "../meta-send";
import { enqueueSalespersonAlert, enqueueSlaCheck } from "../routing/queue";

const MAX_REASSIGNS = 2;

// Worker-side twin of apps/api/src/routing/routing-engine.service.ts — the
// worker creates leads directly from inbound webhooks (findOrCreateLeadByIdentity)
// with no Nest DI to inject the API's version with, same reason meta-send.ts
// and decrypt-token.ts are duplicated rather than shared.
export async function applyToNewLead(workspaceId: string, leadId: string): Promise<void> {
  try {
    await run(workspaceId, leadId);
  } catch (err) {
    console.error(`Routing/scoring failed for lead ${leadId}:`, err);
  }
}

async function run(workspaceId: string, leadId: string): Promise<void> {
  const lead = await prisma.lead.findUnique({
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
    prisma.scoringRule.findMany({ where: { workspaceId } }),
    prisma.routingRule.findMany({ where: { workspaceId }, orderBy: { order: "asc" } })
  ]);

  const score = computeScore(scoringRules as unknown as ScoringRuleInput[], context);
  if (score !== 0) {
    await prisma.lead.update({ where: { id: leadId }, data: { score } });
  }

  const assignTo = matchRoutingRule(routingRules as unknown as RoutingRuleInput[], context);
  const userId = await resolveAssignee(workspaceId, assignTo);
  if (!userId) {
    console.warn(`No available member to route lead ${leadId} in workspace ${workspaceId}`);
    return;
  }

  await assign(workspaceId, leadId, userId, null);
}

async function assign(workspaceId: string, leadId: string, userId: string, reassignedFromId: string | null): Promise<void> {
  await prisma.$transaction([
    prisma.lead.update({ where: { id: leadId }, data: { ownerId: userId } }),
    prisma.assignment.create({ data: { leadId, userId, reassignedFromId } })
  ]);

  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const slaTimer = await prisma.slaTimer.create({
    data: { workspaceId, leadId, dueAt: new Date(Date.now() + workspace.slaMinutes * 60_000) }
  });

  await enqueueSalespersonAlert(workspaceId, leadId, userId);
  await enqueueSlaCheck(slaTimer.id, workspace.slaMinutes * 60_000);
}

async function resolveAssignee(workspaceId: string, assignTo: AssignTo | null, excludeUserId?: string): Promise<string | null> {
  if (assignTo?.type === "user" && assignTo.targetId && assignTo.targetId !== excludeUserId) return assignTo.targetId;

  const teamId = assignTo?.type === "team" ? assignTo.targetId : undefined;
  const candidates = await availableCandidates(workspaceId, teamId, excludeUserId);
  if (candidates.length === 0) return null;

  if (assignTo?.type === "round_robin") {
    const totalAssignments = await prisma.assignment.count({ where: { lead: { workspaceId } } });
    return pickRoundRobin(candidates, totalAssignments);
  }
  return pickLeastBusy(candidates);
}

async function availableCandidates(workspaceId: string, teamId?: string, excludeUserId?: string): Promise<RoutingCandidate[]> {
  const members = await prisma.membership.findMany({
    where: { workspaceId, available: true, ...(teamId ? { teamId } : {}), ...(excludeUserId ? { userId: { not: excludeUserId } } : {}) }
  });
  return Promise.all(
    members.map(async (m) => ({
      userId: m.userId,
      openLeadCount: await prisma.lead.count({
        where: { workspaceId, ownerId: m.userId, mergedIntoId: null, OR: [{ stageId: null }, { stage: { type: "open" } }] }
      })
    }))
  );
}

// Fires when a delayed sla_check job wakes up — reassigns to a fresh
// salesperson (skipping the current owner) up to MAX_REASSIGNS times, then
// escalates to a manager (docs/PRD.md: "escalate to manager after 2
// reassigns"). No-ops if the timer was already resolved by a human reply
// (InboxService.sendMessage) in the meantime.
export async function processSlaCheck(slaTimerId: string): Promise<void> {
  const timer = await prisma.slaTimer.findUnique({ where: { id: slaTimerId } });
  if (!timer || timer.resolvedAt || timer.escalatedAt) return;

  const lead = await prisma.lead.findUnique({ where: { id: timer.leadId } });
  if (!lead) return;

  const reassignCount = await prisma.assignment.count({ where: { leadId: timer.leadId } });

  if (reassignCount > MAX_REASSIGNS) {
    // Already escalated in an earlier pass — shouldn't normally happen since
    // escalation doesn't schedule a further check, but guards against a
    // race between two overlapping timers.
    return;
  }

  if (reassignCount === MAX_REASSIGNS) {
    const manager =
      (await prisma.membership.findFirst({ where: { workspaceId: timer.workspaceId, role: "manager" } })) ??
      (await prisma.membership.findFirst({ where: { workspaceId: timer.workspaceId, role: "owner" } }));
    await prisma.slaTimer.update({ where: { id: timer.id }, data: { escalatedAt: new Date() } });
    if (manager) {
      await prisma.assignment.create({ data: { leadId: timer.leadId, userId: manager.userId, reassignedFromId: lead.ownerId } });
      await prisma.lead.update({ where: { id: timer.leadId }, data: { ownerId: manager.userId } });
      await enqueueSalespersonAlert(timer.workspaceId, timer.leadId, manager.userId, "SLA escalation — 2 reassigns with no reply");
    }
    return;
  }

  const nextUserId = await resolveAssignee(timer.workspaceId, null, lead.ownerId ?? undefined);
  if (!nextUserId) {
    console.warn(`SLA breach on lead ${timer.leadId} but no other available member to reassign to`);
    return;
  }
  await assign(timer.workspaceId, timer.leadId, nextUserId, lead.ownerId);
}

// Structurally complete but only live-testable against a real Meta WhatsApp
// app (same caveat as every Meta-integration piece this session) — sends a
// plain-text alert to the salesperson's own phone via the workspace's
// connected number. A tappable "call" button needs a WhatsApp interactive
// message type, not plain text; noted as a follow-up.
export async function processSalespersonAlert(workspaceId: string, leadId: string, userId: string, note?: string): Promise<void> {
  const [user, lead, number] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.lead.findUnique({ where: { id: leadId } }),
    prisma.whatsappNumber.findFirst({ where: { workspaceId } })
  ]);
  if (!user?.phone) {
    console.warn(`Salesperson ${userId} has no phone on file — skipping alert for lead ${leadId}`);
    return;
  }
  if (!number) {
    console.warn(`No connected WhatsApp number for workspace ${workspaceId} — skipping salesperson alert`);
    return;
  }
  if (!lead) return;

  const summary = [
    `New lead assigned: ${lead.name ?? lead.phone ?? "Unknown"}`,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.source ? `Source: ${lead.source}` : null,
    `Score: ${lead.score}`,
    note ? `⚠️ ${note}` : null
  ]
    .filter(Boolean)
    .join("\n");

  await sendWhatsappText(number.phoneNumberId, user.phone, summary, decryptToken(number.accessTokenCipher));
}
