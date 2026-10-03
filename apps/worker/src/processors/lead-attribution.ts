import { prisma } from "@zenora/db";
import { extractAdReferral } from "@zenora/shared";

// First-touch attribution: the first ad a lead clicked keeps the credit, so
// `adId: null` in the filter makes later referrals a no-op (and a retried
// webhook harmless). A referral on a message with no ad data does nothing.
export async function recordAdReferral(leadId: string, rawReferral: unknown, channel: "whatsapp" | "instagram"): Promise<void> {
  const referral = extractAdReferral(rawReferral, channel);
  if (!referral) return;
  await prisma.lead.updateMany({
    where: { id: leadId, adId: null },
    data: { adId: referral.adId, adReferral: { ...referral } }
  });
}
