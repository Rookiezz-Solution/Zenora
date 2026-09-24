import { prisma } from "@zenora/db";
import { publishInboxEvent } from "../realtime";
import { findOrCreateConversation } from "./conversation";
import { findOrCreateLeadByIdentity } from "./lead-identity";

interface InstagramWebhookPayload {
  object: "instagram";
  entry?: Array<{
    id: string; // IG business account id (identifies which connected account)
    messaging?: Array<{
      sender: { id: string };
      recipient: { id: string };
      timestamp: number;
      message?: { mid: string; text?: string; attachments?: unknown[] };
    }>;
  }>;
}

export async function processInstagramPayload(payload: unknown): Promise<void> {
  const body = payload as InstagramWebhookPayload;

  for (const entry of body.entry ?? []) {
    const account = await prisma.instagramAccount.findUnique({ where: { igUserId: entry.id } });
    if (!account) {
      console.warn(`No connected InstagramAccount for igUserId=${entry.id}, skipping entry`);
      continue;
    }

    for (const event of entry.messaging ?? []) {
      // Ignore echoes of our own outbound sends (sender === the business account).
      if (!event.message || event.sender.id === entry.id) continue;

      const lead = await findOrCreateLeadByIdentity(account.workspaceId, "ig_scoped_id", event.sender.id);
      const conversation = await findOrCreateConversation(account.workspaceId, lead.id, "instagram");
      const message = await prisma.message.upsert({
        where: { externalId: event.message.mid },
        update: {},
        create: {
          conversationId: conversation.id,
          direction: "inbound",
          type: event.message.attachments?.length ? "image" : "text",
          body: event.message.text,
          externalId: event.message.mid,
          createdAt: new Date(event.timestamp)
        }
      });
      await publishInboxEvent({ workspaceId: account.workspaceId, type: "message.created", payload: message });
    }
  }
}
