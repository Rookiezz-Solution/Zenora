import { prisma } from "@zenora/db";
import type { SequenceStep } from "@zenora/shared";
import { decryptToken } from "../decrypt-token";
import { sendInstagramMessage, sendWhatsappText } from "../meta-send";
import { publishInboxEvent } from "../realtime";
import { enqueueSequenceStep } from "../routing/queue";
import { findOrCreateConversation } from "./conversation";

// Advances one lead through a follow-up sequence (docs/ROADMAP.md Phase 1
// item 8) — a linear timed list, not the automation engine's branching flow
// graph (Phase 1 item 5). Each step re-enqueues itself as a delayed job for
// the next step, the same suspend/resume idiom the automation engine uses
// for its `wait` block.
export async function processSequenceStep(enrollmentId: string): Promise<void> {
  const enrollment = await prisma.sequenceEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { sequence: true }
  });
  if (!enrollment || enrollment.status !== "active") return;

  const steps = enrollment.sequence.steps as unknown as SequenceStep[];
  const step = steps[enrollment.currentStep];
  if (!step) {
    await prisma.sequenceEnrollment.update({ where: { id: enrollmentId }, data: { status: "completed" } });
    return;
  }

  try {
    await runAction(enrollment.sequence.workspaceId, enrollment.leadId, step.action);
  } catch (err) {
    console.error(`Sequence step failed for enrollment ${enrollmentId}:`, err);
  }

  const nextIndex = enrollment.currentStep + 1;
  await prisma.sequenceEnrollment.update({ where: { id: enrollmentId }, data: { currentStep: nextIndex } });

  const nextStep = steps[nextIndex];
  if (nextStep) {
    await enqueueSequenceStep(enrollmentId, nextStep.waitHours * 3_600_000);
  } else {
    await prisma.sequenceEnrollment.update({ where: { id: enrollmentId }, data: { status: "completed" } });
  }
}

async function runAction(workspaceId: string, leadId: string, action: SequenceStep["action"]): Promise<void> {
  switch (action.type) {
    case "send_text":
      await sendText(workspaceId, leadId, action.body);
      return;
    case "tag": {
      const tag = await prisma.tag.upsert({
        where: { workspaceId_name: { workspaceId, name: action.tagName } },
        update: {},
        create: { workspaceId, name: action.tagName }
      });
      await prisma.leadTag.upsert({
        where: { leadId_tagId: { leadId, tagId: tag.id } },
        update: {},
        create: { leadId, tagId: tag.id }
      });
      return;
    }
    case "create_task": {
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      await prisma.task.create({
        data: { workspaceId, leadId, title: action.title, assignedToId: lead?.ownerId ?? undefined }
      });
      return;
    }
  }
}

async function sendText(workspaceId: string, leadId: string, body: string): Promise<void> {
  const identities = await prisma.leadIdentity.findMany({ where: { leadId } });
  const waIdentity = identities.find((i) => i.type === "wa_phone");
  const igIdentity = identities.find((i) => i.type === "ig_scoped_id");

  let externalId: string;
  let channel: "whatsapp" | "instagram";
  if (waIdentity) {
    const number = await prisma.whatsappNumber.findFirst({ where: { workspaceId } });
    if (!number) throw new Error(`No connected WhatsApp number for workspace ${workspaceId}`);
    externalId = await sendWhatsappText(number.phoneNumberId, waIdentity.value, body, decryptToken(number.accessTokenCipher));
    channel = "whatsapp";
  } else if (igIdentity) {
    const account = await prisma.instagramAccount.findFirst({ where: { workspaceId } });
    if (!account) throw new Error(`No connected Instagram account for workspace ${workspaceId}`);
    externalId = await sendInstagramMessage(account.igUserId, igIdentity.value, body, decryptToken(account.accessTokenCipher));
    channel = "instagram";
  } else {
    throw new Error(`Lead ${leadId} has no channel identity to send a sequence message to`);
  }

  const conversation = await findOrCreateConversation(workspaceId, leadId, channel);
  const message = await prisma.message.create({
    data: { conversationId: conversation.id, direction: "outbound", type: "text", body, externalId, status: "sent" }
  });
  await publishInboxEvent({ workspaceId, type: "message.created", payload: message });
}
