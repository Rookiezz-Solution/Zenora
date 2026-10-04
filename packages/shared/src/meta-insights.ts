import { parseSpendMinor } from "./ads";

// Reading ad performance from Meta's Marketing API (read-only, ads_read). Lives
// here so the API (the "Sync now" button) and the worker (the scheduled sync)
// use exactly the same code.

export interface MetaInsightRow {
  date: string;
  adId: string;
  adName: string | null;
  campaignId: string;
  campaignName: string;
  spend: string;
  impressions: string;
  clicks: string;
}

// What is stored for one ad on one day.
export interface AdStatData {
  adName: string | null;
  campaignId: string;
  campaignName: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
}

export function toAdStatData(r: MetaInsightRow): AdStatData {
  return {
    adName: r.adName,
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    spendMinor: parseSpendMinor(r.spend),
    impressions: Number.parseInt(r.impressions, 10) || 0,
    clicks: Number.parseInt(r.clicks, 10) || 0
  };
}

const MAX_PAGES = 20;

export async function metaGraphGet<T>(graphVersion: string, urlOrPath: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(urlOrPath.startsWith("http") ? urlOrPath : `https://graph.facebook.com/${graphVersion}${urlOrPath}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const body = (await res.json()) as T & { error?: { message?: string; code?: number } };
  if (!res.ok) {
    const code = body.error?.code;
    // 190 = the access token expired or was revoked.
    throw new Error(code === 190 ? "Meta access expired — reconnect your ad account" : `Meta Ads API error: ${body.error?.message ?? res.status}`);
  }
  return body;
}

// Per-ad, per-day spend for a window. Following `paging.next` is capped so a huge
// account can't turn one call into an unbounded loop.
export async function fetchMetaInsights(graphVersion: string, accessToken: string, accountId: string, since: string, until: string): Promise<MetaInsightRow[]> {
  type Page = {
    data?: { date_start: string; ad_id: string; ad_name?: string; campaign_id: string; campaign_name?: string; spend?: string; impressions?: string; clicks?: string }[];
    paging?: { next?: string };
  };
  let page = await metaGraphGet<Page>(graphVersion, `/act_${accountId}/insights`, {
    access_token: accessToken,
    level: "ad",
    time_increment: "1",
    fields: "ad_id,ad_name,campaign_id,campaign_name,spend,impressions,clicks",
    time_range: JSON.stringify({ since, until }),
    limit: "500"
  });
  const rows: MetaInsightRow[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    for (const r of page.data ?? []) {
      rows.push({
        date: r.date_start,
        adId: r.ad_id,
        adName: r.ad_name ?? null,
        campaignId: r.campaign_id,
        campaignName: r.campaign_name ?? r.campaign_id,
        spend: r.spend ?? "0",
        impressions: r.impressions ?? "0",
        clicks: r.clicks ?? "0"
      });
    }
    if (!page.paging?.next) break;
    page = await metaGraphGet<Page>(graphVersion, page.paging.next);
  }
  return rows;
}
