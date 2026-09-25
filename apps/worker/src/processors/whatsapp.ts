import { prisma } from "@zenora/db";
import { enqueueStart } from "../automation-engine/queue";
import { findMatchingAutomations } from "../automation-engine/trigger-matcher";
import { publishInboxEvent } from "../realtime";
import { findOrCreateConversation } from "./conversation";
import { findOrCreateLeadByIdentity } from "./lead-identity";

interface MessagesValue {
  metadata: { phone_number_id: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id: string }>;
  messages?: Array<{ id: string; from: string; timestamp: string; type: string; text?: { body: string } }>;
}

// docs/ROADMAP.md Phase 1 item 7: "Meta approval sync" — this is how a
// submitted template's review result comes back (the alternative is
// TemplatesService.sync's manual poll).
interface TemplateStatusUpdateValue {
  event?: string;
  message_template_id?: number;
  message_template_name?: string;
  reason?: string;
}

interface WhatsappWebhookPayload {
  object: "whatsapp_business_account";
  entry?: Array<{
    id: string; // WABA id
    changes?: Array<{ field: string; value: Partial<MessagesValue> & Partial<TemplateStatusUpdateValue> }>;
  }>;
}

export async function processWhatsappPayload(payload: unknown): Promise<void> {
  const body = payload as WhatsappWebhookPayload;

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "messages" && change.value.metadata && change.value.messages) {
        await processMessages(change.value as MessagesValue);
      } else if (change.field === "message_template_status_update") {
        await processTemplateStatusUpdate(change.value as TemplateStatusUpdateValue);
      }
    }
  }
}

async function processMessages(value: MessagesValue) {
  const number = await prisma.whatsappNumber.findUnique({ where: { phoneNumberId: value.metadata.phone_number_id } });
  if (!number) {
    console.warn(`No connected WhatsappNumber for phoneNumberId=${value.metadata.phone_number_id}, skipping`);
    return;
  }

  const contactsByWaId = new Map((value.contacts ?? []).map((c) => [c.wa_id, c]));

  for (const message of value.messages ?? []) {
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

    if (conversation.botActive && message.text?.body) {
      const matches = await findMatchingAutomations(number.workspaceId, "whatsapp_message_keyword", message.text.body, lead.id);
      for (const automation of matches) {
        await enqueueStart(automation.id, lead.id, conversation.id);
      }
    }
  }
}

async function processTemplateStatusUpdate(value: TemplateStatusUpdateValue) {
  if (!value.event || !value.message_template_id) return;
  const template = await prisma.waTemplate.findFirst({ where: { metaTemplateId: String(value.message_template_id) } });
  if (!template) {
    console.warn(`No WaTemplate found for metaTemplateId=${value.message_template_id}, skipping status update`);
    return;
  }
  await prisma.waTemplate.update({
    where: { id: template.id },
    data: { metaStatus: value.event.toLowerCase(), rejectionReason: value.reason ?? null }
  });
}
