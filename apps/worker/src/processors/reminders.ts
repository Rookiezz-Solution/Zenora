import { prisma } from "@zenora/db";
import { MAX_REMINDER_HOURS, buildReminderParams, formatAppointmentTime, isReminderDue } from "@zenora/shared";
import { decryptToken } from "../decrypt-token";
import { sendWhatsappTemplate } from "../meta-send";
import { publishInboxEvent } from "../realtime";
import { findOrCreateConversation } from "./conversation";

const HOUR_MS = 3_600_000;

// Runs every few minutes (scheduled in index.ts). A sweep rather than one
// delayed job per booking: it survives config changes and cancellations, and
// BullMQ delays can't reach a booking made 60 days out.
//
// Each appointment gets exactly one attempt — `reminderStatus` is set to
// "sent" or "failed" either way, so a flaky send can't turn into repeated
// messages to a guest.
export async function processReminderSweep(now: Date = new Date()): Promise<{ sent: number; failed: number }> {
  const candidates = await prisma.appointment.findMany({
    where: {
      status: "booked",
      reminderStatus: null,
      startsAt: { gt: now, lte: new Date(now.getTime() + MAX_REMINDER_HOURS * HOUR_MS) },
      appointmentType: { reminderHoursBefore: { not: null }, reminderTemplateId: { not: null } }
    },
    include: { appointmentType: true, workspace: { select: { timezone: true } } }
  });

  let sent = 0;
  let failed = 0;
  for (const appt of candidates) {
    const type = appt.appointmentType;
    const due = isReminderDue({ startsAtMs: appt.startsAt.getTime(), createdAtMs: appt.createdAt.getTime(), hoursBefore: type.reminderHoursBefore! }, now.getTime());
    if (!due) continue;

    try {
      await sendReminder(appt, type.reminderTemplateId!, appt.workspace.timezone);
      await prisma.appointment.update({ where: { id: appt.id }, data: { reminderStatus: "sent", reminderSentAt: now, reminderError: null } });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 300) : "Reminder failed";
      console.error(`Reminder for appointment ${appt.id} failed:`, err);
      await prisma.appointment.update({ where: { id: appt.id }, data: { reminderStatus: "failed", reminderError: message } });
      failed++;
    }
  }
  return { sent, failed };
}

async function sendReminder(
  appt: { id: string; workspaceId: string; leadId: string | null; guestName: string; guestPhone: string; startsAt: Date; appointmentType: { name: string } },
  templateId: string,
  timezone: string
) {
  const template = await prisma.waTemplate.findFirst({ where: { id: templateId, workspaceId: appt.workspaceId } });
  if (!template || template.metaStatus !== "approved") throw new Error("The reminder template is missing or not approved by Meta");
  const number = await prisma.whatsappNumber.findFirst({ where: { workspaceId: appt.workspaceId } });
  if (!number) throw new Error("No WhatsApp number is connected");

  const params = buildReminderParams(template.bodyText, {
    guestName: appt.guestName,
    when: formatAppointmentTime(appt.startsAt.getTime(), timezone),
    service: appt.appointmentType.name
  });
  // The guest ticked the contact-consent box with this number when booking.
  const externalId = await sendWhatsappTemplate(number.phoneNumberId, appt.guestPhone, template.name, template.language, decryptToken(number.accessTokenCipher), params);

  if (!appt.leadId) return;
  const conversation = await findOrCreateConversation(appt.workspaceId, appt.leadId, "whatsapp");
  const message = await prisma.message.create({
    data: { conversationId: conversation.id, direction: "outbound", type: "template", body: template.bodyText, externalId, status: "sent" }
  });
  await publishInboxEvent({ workspaceId: appt.workspaceId, type: "message.created", payload: message });
}
