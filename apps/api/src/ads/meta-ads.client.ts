import { BadRequestException, Injectable } from "@nestjs/common";
import { loadEnv } from "../config/env";

export interface MetaAdAccount {
  externalAccountId: string; // without the "act_" prefix
  name: string | null;
  currency: string | null;
}

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

const MAX_PAGES = 20;

// Thin wrapper over Meta's Marketing API (read-only: ads_read). Each user
// connects their own ad account by logging in with Facebook; the Meta app's
// id/secret come from the super admin dashboard. Structurally complete and
// unit-tested with mocked responses — no Meta app credentials exist here.
// Official APIs only (CLAUDE.md rule #1).
@Injectable()
export class MetaAdsClient {
  redirectUri(): string {
    return `${loadEnv().API_URL}/ads/meta/callback`;
  }

  buildAuthUrl(state: string): string {
    const { META_APP_ID } = loadEnv();
    if (!META_APP_ID) {
      throw new BadRequestException("Meta isn't configured yet — a platform admin needs to add the Meta app in the admin dashboard");
    }
    const url = new URL("https://www.facebook.com/dialog/oauth");
    url.searchParams.set("client_id", META_APP_ID);
    url.searchParams.set("redirect_uri", this.redirectUri());
    url.searchParams.set("scope", "ads_read");
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    return url.toString();
  }

  private base() {
    return `https://graph.facebook.com/${loadEnv().META_GRAPH_API_VERSION}`;
  }

  private async get<T>(urlOrPath: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(urlOrPath.startsWith("http") ? urlOrPath : `${this.base()}${urlOrPath}`);
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

  async listAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
    const body = await this.get<{ data?: { account_id: string; name?: string; currency?: string }[] }>("/me/adaccounts", {
      access_token: accessToken,
      fields: "account_id,name,currency",
      limit: "50"
    });
    return (body.data ?? []).map((a) => ({ externalAccountId: a.account_id, name: a.name ?? null, currency: a.currency ?? null }));
  }

  // Per-ad, per-day spend for a window. Following `paging.next` is capped so
  // a huge account can't turn one click into an unbounded loop.
  async fetchInsights(accessToken: string, accountId: string, since: string, until: string): Promise<MetaInsightRow[]> {
    type Page = {
      data?: { date_start: string; ad_id: string; ad_name?: string; campaign_id: string; campaign_name?: string; spend?: string; impressions?: string; clicks?: string }[];
      paging?: { next?: string };
    };
    let page = await this.get<Page>(`/act_${accountId}/insights`, {
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
      page = await this.get<Page>(page.paging.next);
    }
    return rows;
  }
}
