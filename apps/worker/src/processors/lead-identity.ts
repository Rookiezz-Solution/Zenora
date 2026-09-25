import { prisma } from "@zenora/db";
import { applyToNewLead } from "./routing";

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

  const lead = await prisma.lead.create({
    data: {
      workspaceId,
      name: attrs.name,
      phone: attrs.phone,
      source: type === "ig_scoped_id" ? "instagram" : "whatsapp",
      identities: { create: { type, value } }
    }
  });
  // Scoring + routing only apply to a genuinely new lead, not a returning
  // one whose identity we already knew (docs/ROADMAP.md Phase 1 item 8).
  await applyToNewLead(workspaceId, lead.id);
  return lead;
}
