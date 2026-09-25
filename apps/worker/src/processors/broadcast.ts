import { prisma } from "@zenora/db";
import { decryptToken } from "../decrypt-token";
import { sendWhatsappTemplate } from "../meta-send";
import { publishInboxEvent } from "../realtime";
import { findOrCreateConversation } from "./conversation";

export async function processBroadcast(broadcastId: string): Promise<void> {
  const broadcast = await prisma.broadcast.findUniqueOrThrow({
    where: { id: broadcastId },
    include: { template: true, recipients: { where: { status: "pending" } } }
  });
  const number = await prisma.whatsappNumber.findFirst({ where: { workspaceId: broadcast.workspaceId } });
  if (!number) {
    await prisma.broadcast.update({ where: { id: broadcastId }, data: { status: "failed" } });
    return;
  }
  const accessToken = decryptToken(number.accessTokenCipher);

  for (const recipient of broadcast.recipients) {
    try {
      const identity = await prisma.leadIdentity.findFirst({ where: { leadId: recipient.leadId, type: "wa_phone" } });
      if (!identity) {
        await prisma.broadcastRecipient.update({ where: { id: recipient.id }, data: { status: "skipped" } });
        continue;
      }

      const externalId = await sendWhatsappTemplate(number.phoneNumberId, identity.value, broadcast.template.name, broadcast.template.language, accessToken);

      const conversation = await findOrCreateConversation(broadcast.workspaceId, recipient.leadId, "whatsapp");
      const message = await prisma.message.create({
        data: { conversationId: conversation.id, direction: "outbound", type: "template", body: broadcast.template.bodyText, externalId, status: "sent" }
      });
      await publishInboxEvent({ workspaceId: broadcast.workspaceId, type: "message.created", payload: message });

      await prisma.broadcastRecipient.update({ where: { id: recipient.id }, data: { status: "sent" } });
    } catch (err) {
      console.error(`Broadcast ${broadcastId} failed to send to lead ${recipient.leadId}:`, err);
      await prisma.broadcastRecipient.update({ where: { id: recipient.id }, data: { status: "failed" } });
    }
  }

  await prisma.broadcast.update({ where: { id: broadcastId }, data: { status: "sent", sentAt: new Date() } });
}
