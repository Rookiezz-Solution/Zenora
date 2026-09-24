import { prisma } from "@zenora/db";
import { processInstagramPayload } from "./instagram";
import { processWhatsappPayload } from "./whatsapp";

export async function processMetaWebhookEvent(eventId: string): Promise<void> {
  const event = await prisma.metaWebhookEvent.findUniqueOrThrow({ where: { id: eventId } });
  try {
    if (event.source === "instagram") {
      await processInstagramPayload(event.payload);
    } else if (event.source === "whatsapp") {
      await processWhatsappPayload(event.payload);
    } else {
      throw new Error(`Unknown webhook source: ${event.source}`);
    }
    await prisma.metaWebhookEvent.update({ where: { id: eventId }, data: { processedAt: new Date(), error: null } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.metaWebhookEvent.update({ where: { id: eventId }, data: { error: message } });
    throw err; // let BullMQ retry per its default backoff
  }
}
