import { prisma } from "@zenora/db";

// Finds the Lead already linked to this channel identity (ig-scoped id / wa
// phone), or creates a new Lead + LeadIdentity. This is the merge point that
// keeps one Instagram commenter and their later WhatsApp number as one lead
// once both identities are seen (docs/PRD.md: "Instagram → WhatsApp
// continuity").
export async function findOrCreateLeadByIdentity(
  workspaceId: string,
  type: "ig_scoped_id" | "wa_phone",
  value: string,
  attrs: { name?: string; phone?: string } = {}
) {
  const existing = await prisma.leadIdentity.findUnique({
    where: { type_value: { type, value } },
    include: { lead: true }
  });
  if (existing) return existing.lead;

  return prisma.lead.create({
    data: {
      workspaceId,
      name: attrs.name,
      phone: attrs.phone,
      source: type === "ig_scoped_id" ? "instagram" : "whatsapp",
      identities: { create: { type, value } }
    }
  });
}
