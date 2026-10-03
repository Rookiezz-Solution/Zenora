import type { PrismaService } from "../prisma/prisma.service";

// Shared by the public forms (link in bio, booking): a phone number the
// workspace already has gets a fresh consent record instead of a duplicate
// lead, so callers can respond identically either way and a visitor can't
// probe which numbers exist.
export async function captureLeadWithConsent(
  prisma: PrismaService,
  input: { workspaceId: string; name: string; phone: string; source: string; consentSource: string }
): Promise<{ leadId: string; created: boolean }> {
  const consent = { type: "data_processing", granted: true, source: input.consentSource };
  const existing = await prisma.client.lead.findFirst({ where: { workspaceId: input.workspaceId, phone: input.phone, mergedIntoId: null } });
  if (existing) {
    await prisma.client.consent.create({ data: { leadId: existing.id, ...consent } });
    return { leadId: existing.id, created: false };
  }
  const lead = await prisma.client.lead.create({
    data: { workspaceId: input.workspaceId, name: input.name, phone: input.phone, source: input.source, consents: { create: consent } }
  });
  return { leadId: lead.id, created: true };
}
