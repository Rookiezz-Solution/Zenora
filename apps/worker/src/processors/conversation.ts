import { prisma, type ConversationChannel } from "@zenora/db";

const WINDOW_HOURS = 24;

// One thread per lead per channel. Every inbound message resets the 24h
// customer-service window (CLAUDE.md rule #5) — outside it, only approved
// templates may be sent back.
export async function findOrCreateConversation(
  workspaceId: string,
  leadId: string,
  channel: ConversationChannel
) {
  const windowExpiresAt = new Date(Date.now() + WINDOW_HOURS * 60 * 60 * 1000);
  const existing = await prisma.conversation.findFirst({ where: { workspaceId, leadId, channel } });
  if (existing) {
    return prisma.conversation.update({ where: { id: existing.id }, data: { windowExpiresAt } });
  }
  return prisma.conversation.create({
    data: { workspaceId, leadId, channel, windowExpiresAt }
  });
}
