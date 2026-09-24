import { prisma } from "@zenora/db";
import { publishInboxEvent } from "../realtime";
import { findOrCreateConversation } from "./conversation";
import { findOrCreateLeadByIdentity } from "./lead-identity";

interface WhatsappWebhookPayload {
  object: "whatsapp_business_account";
  entry?: Array<{
    id: string; // WABA id
    changes?: Array<{
      field: string;
      value: {
        metadata: { phone_number_id: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id: string }>;
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body: string };
        }>;
      };
    }>;
  }>;
}

export async function processWhatsappPayload(payload: unknown): Promise<void> {
  const body = payload as WhatsappWebhookPayload;

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages" || !change.value.messages) continue;

      const number = await prisma.whatsappNumber.findUnique({
        where: { phoneNumberId: change.value.metadata.phone_number_id }
      });
      if (!number) {
        console.warn(`No connected WhatsappNumber for phoneNumberId=${change.value.metadata.phone_number_id}, skipping`);
        continue;
      }

      const contactsByWaId = new Map((change.value.contacts ?? []).map((c) => [c.wa_id, c]));

      for (const message of change.value.messages) {
        const contact = contactsByWaId.get(message.from);
        const lead = await findOrCreateLeadByIdentity(number.workspaceId, "wa_phone", message.from, {
          name: contact?.profile?.name,
          phone: message.from
        });
        const conversation = await findOrCreateConversation(number.workspaceId, lead.id, "whatsapp");
        const created = await prisma.message.upsert({
          where: { externalId: message.id },
          update: {},
          create: {
            conversationId: conversation.id,
            direction: "inbound",
            type: message.type === "text" ? "text" : message.type,
            body: message.text?.body,
            externalId: message.id,
            createdAt: new Date(Number(message.timestamp) * 1000)
          }
        });
        await publishInboxEvent({ workspaceId: number.workspaceId, type: "message.created", payload: created });
      }
    }
  }
}
