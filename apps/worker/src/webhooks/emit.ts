import { prisma, type Prisma } from "@zenora/db";
import type { WebhookEvent } from "@zenora/shared";
import { randomUUID } from "node:crypto";
import { enqueueWebhookDelivery } from "./queue";

// The worker-side twin of the API's WebhooksService.emit: used where the worker
// itself creates the thing (a lead from an inbound DM). Never throws — a
// webhook problem must not fail message handling.
export async function emitWebhookEvent(workspaceId: string, event: WebhookEvent, data: unknown): Promise<void> {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({ where: { workspaceId, active: true, events: { has: event } }, select: { id: true } });
    for (const endpoint of endpoints) {
      const id = randomUUID();
      const payload = { id, event, createdAt: new Date().toISOString(), workspaceId, data };
      await prisma.webhookDelivery.create({ data: { id, workspaceId, endpointId: endpoint.id, event, payload: payload as Prisma.InputJsonValue } });
      await enqueueWebhookDelivery(id);
    }
  } catch (err) {
    console.warn(`Could not queue ${event} webhooks:`, err instanceof Error ? err.message : err);
  }
}
