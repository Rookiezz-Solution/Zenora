import { prisma } from "@zenora/db";
import { RAW_EVENT_RETENTION_DAYS, WEBHOOK_DELIVERY_RETENTION_DAYS, retentionCutoff } from "@zenora/shared";

export interface RetentionResult {
  messages: number;
  rawEvents: number;
  webhookDeliveries: number;
}

// Daily. Applies each workspace's chosen message retention, and clears the
// short-lived copies of people's details we keep only for debugging (raw Meta
// webhook payloads and webhook delivery logs). Conversations and leads stay;
// only old message content goes.
export async function processRetentionSweep(now: Date = new Date()): Promise<RetentionResult> {
  const workspaces = await prisma.workspace.findMany({ where: { messageRetentionDays: { not: null } }, select: { id: true, messageRetentionDays: true } });

  let messages = 0;
  for (const ws of workspaces) {
    const result = await prisma.message.deleteMany({
      where: { conversation: { workspaceId: ws.id }, createdAt: { lt: retentionCutoff(now, ws.messageRetentionDays!) } }
    });
    messages += result.count;
  }

  const rawEvents = await prisma.metaWebhookEvent.deleteMany({ where: { receivedAt: { lt: retentionCutoff(now, RAW_EVENT_RETENTION_DAYS) } } });
  const deliveries = await prisma.webhookDelivery.deleteMany({ where: { createdAt: { lt: retentionCutoff(now, WEBHOOK_DELIVERY_RETENTION_DAYS) } } });

  const result = { messages, rawEvents: rawEvents.count, webhookDeliveries: deliveries.count };
  console.log(`Retention sweep: ${JSON.stringify(result)}`);
  return result;
}
