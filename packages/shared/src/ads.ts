// Ads attribution (docs/PRD.md section 12, `Sources`): which Meta campaign a
// lead came from, and what each campaign cost per result. Pure so the API,
// the worker (webhook ingestion) and tests all agree.

// Meta reports spend as a decimal string in the account currency ("123.45").
// Stored as integer minor units (paise/cents) so cost maths never drifts.
export function parseSpendMinor(spend: string | number | undefined | null): number {
  const n = typeof spend === "number" ? spend : Number.parseFloat(spend ?? "");
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

export interface AdReferral {
  adId: string;
  channel: "whatsapp" | "instagram";
  headline?: string;
}

// Click-to-WhatsApp and Click-to-Instagram ads attach a `referral` object to
// the first inbound message. Field names follow Meta's webhook docs:
// WhatsApp { source_type: "ad", source_id, headline }, Instagram { ad_id, ... }.
// Anything that isn't clearly an ad (a post, a plain link) returns null.
export function extractAdReferral(raw: unknown, channel: "whatsapp" | "instagram"): AdReferral | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ctx = (r.ads_context_data ?? {}) as Record<string, unknown>;

  if (channel === "whatsapp") {
    if (r.source_type !== "ad" || typeof r.source_id !== "string" || !r.source_id) return null;
    return { adId: r.source_id, channel, headline: typeof r.headline === "string" ? r.headline : undefined };
  }

  const adId = typeof r.ad_id === "string" && r.ad_id ? r.ad_id : typeof r.source_id === "string" && r.source_id ? r.source_id : null;
  if (!adId) return null;
  return { adId, channel, headline: typeof ctx.ad_title === "string" ? ctx.ad_title : undefined };
}

export interface AdStatRow {
  adId: string;
  campaignId: string;
  campaignName: string;
  currency: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
}

export interface AdLeadRow {
  adId: string | null;
  source: string | null;
  won: boolean;
  hasAppointment: boolean;
}

export interface CampaignRow {
  campaignId: string;
  campaignName: string;
  currency: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
  leads: number;
  appointments: number;
  won: number;
  costPerLeadMinor: number | null;
  costPerAppointmentMinor: number | null;
  costPerWonMinor: number | null;
}

export interface SourceRow {
  source: string;
  leads: number;
}

const costPer = (spendMinor: number, count: number) => (count > 0 ? Math.round(spendMinor / count) : null);

// `stats` are per-ad rows already limited to the reporting window (several
// days per ad are fine); `leads` are leads created in the same window.
// First-touch attribution: a lead belongs to the ad that opened its chat.
export function buildAdsReport(stats: AdStatRow[], leads: AdLeadRow[]) {
  const campaigns = new Map<string, CampaignRow & { adIds: Set<string> }>();
  for (const s of stats) {
    const row =
      campaigns.get(s.campaignId) ??
      {
        campaignId: s.campaignId,
        campaignName: s.campaignName,
        currency: s.currency,
        spendMinor: 0,
        impressions: 0,
        clicks: 0,
        leads: 0,
        appointments: 0,
        won: 0,
        costPerLeadMinor: null,
        costPerAppointmentMinor: null,
        costPerWonMinor: null,
        adIds: new Set<string>()
      };
    row.spendMinor += s.spendMinor;
    row.impressions += s.impressions;
    row.clicks += s.clicks;
    row.adIds.add(s.adId);
    campaigns.set(s.campaignId, row);
  }

  const campaignByAd = new Map<string, string>();
  for (const [id, c] of campaigns) for (const adId of c.adIds) campaignByAd.set(adId, id);

  let unmatchedAdLeads = 0;
  for (const lead of leads) {
    if (!lead.adId) continue;
    const campaignId = campaignByAd.get(lead.adId);
    if (!campaignId) {
      unmatchedAdLeads += 1;
      continue;
    }
    const c = campaigns.get(campaignId)!;
    c.leads += 1;
    if (lead.hasAppointment) c.appointments += 1;
    if (lead.won) c.won += 1;
  }

  const rows: CampaignRow[] = [...campaigns.values()]
    .map(({ adIds: _adIds, ...c }) => ({
      ...c,
      costPerLeadMinor: costPer(c.spendMinor, c.leads),
      costPerAppointmentMinor: costPer(c.spendMinor, c.appointments),
      costPerWonMinor: costPer(c.spendMinor, c.won)
    }))
    .sort((a, b) => b.spendMinor - a.spendMinor);

  const bySource = new Map<string, number>();
  for (const lead of leads) {
    const key = lead.adId ? "ad" : (lead.source ?? "unknown");
    bySource.set(key, (bySource.get(key) ?? 0) + 1);
  }
  const sources: SourceRow[] = [...bySource.entries()].map(([source, n]) => ({ source, leads: n })).sort((a, b) => b.leads - a.leads);

  return { campaigns: rows, unmatchedAdLeads, sources };
}
