import { prisma } from "@zenora/db";
import { enqueueStart } from "../automation-engine/queue";
import { findCrmEventAutomations } from "../automation-engine/trigger-matcher";

// A new lead is scored the moment it is created, before its conversation exists,
// and a flow needs a conversation to send through. So "score reached" automations
// for a brand-new lead are started here, once the first message has made the
// conversation. (Later score changes are raised by the API.)
export async function fireNewLeadScoreEvent(workspaceId: string, leadId: string, conversationId: string): Promise<void> {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { score: true } });
    if (!lead || lead.score <= 0) return;
    const matches = await findCrmEventAutomations(workspaceId, leadId, "score_reached", { scoreBefore: 0, scoreAfter: lead.score });
    for (const automation of matches) await enqueueStart(automation.id, leadId, conversationId, automation.delayMs);
  } catch (err) {
    console.error(`Could not start score-reached automations for lead ${leadId}:`, err);
  }
}
