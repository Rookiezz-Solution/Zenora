import { Injectable } from "@nestjs/common";
import { defaultCountryCodeForTimezone, hasActiveConsent, phoneForAudience } from "@zenora/shared";
import * as crypto from "node:crypto";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

const MAX_ROWS = 100_000;

export interface AudienceFilter {
  tag?: string;
}

// Customer lists for Meta ads, as a file the owner uploads to Ads Manager
// themselves ("Create a custom audience → customer list"). Nothing is sent to
// Meta from here: that would need Meta's `ads_management` permission, which
// can change a business's ads, and Zenora promises read-only access.
//
// Only people with an ACTIVE marketing consent are included, and phone numbers
// are SHA-256 hashed the way Meta asks, so the file never contains a readable
// number.
@Injectable()
export class AudiencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  private async eligible(workspaceId: string, filter: AudienceFilter) {
    const workspace = await this.prisma.client.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { timezone: true } });
    const countryCode = defaultCountryCodeForTimezone(workspace.timezone);

    const leads = await this.prisma.client.lead.findMany({
      where: { workspaceId, mergedIntoId: null, phone: { not: null }, ...(filter.tag ? { tags: { some: { tag: { name: filter.tag, workspaceId } } } } : {}) },
      select: { id: true, phone: true },
      take: MAX_ROWS
    });
    const records = await this.prisma.client.consent.findMany({
      where: { leadId: { in: leads.map((l) => l.id) }, type: "marketing" },
      select: { leadId: true, type: true, granted: true, createdAt: true }
    });
    const byLead = new Map<string, typeof records>();
    for (const r of records) byLead.set(r.leadId, [...(byLead.get(r.leadId) ?? []), r]);

    const withConsent = leads.filter((l) => hasActiveConsent(byLead.get(l.id) ?? [], "marketing"));
    const phones = new Set<string>();
    for (const l of withConsent) {
      const normalised = l.phone ? phoneForAudience(l.phone, countryCode) : null;
      if (normalised) phones.add(normalised);
    }
    return { total: leads.length, withConsent: withConsent.length, phones: [...phones] };
  }

  async preview(workspaceId: string, filter: AudienceFilter) {
    const { total, withConsent, phones } = await this.eligible(workspaceId, filter);
    return { contacts: total, withMarketingConsent: withConsent, uploadable: phones.length };
  }

  // Returns the CSV text (header "phone", one SHA-256 per line). The audit entry
  // records who exported how many, never the numbers or the hashes.
  async exportForMeta(workspaceId: string, userId: string, filter: AudienceFilter): Promise<{ csv: string; count: number }> {
    const { phones } = await this.eligible(workspaceId, filter);
    const csv = ["phone", ...phones.map((p) => crypto.createHash("sha256").update(p).digest("hex"))].join("\n") + "\n";
    await this.audit.log({
      workspaceId,
      userId,
      action: "audience.exported",
      entityType: "workspace",
      entityId: workspaceId,
      metadata: { destination: "meta_customer_list", count: phones.length, tag: filter.tag ?? null }
    });
    return { csv, count: phones.length };
  }
}
