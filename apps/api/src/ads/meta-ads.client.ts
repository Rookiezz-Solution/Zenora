import { BadRequestException, Injectable } from "@nestjs/common";
import { fetchMetaInsights, metaGraphGet, type MetaInsightRow } from "@zenora/shared";
import { loadEnv } from "../config/env";

export type { MetaInsightRow };

export interface MetaAdAccount {
  externalAccountId: string; // without the "act_" prefix
  name: string | null;
  currency: string | null;
}

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

  private get<T>(urlOrPath: string, params: Record<string, string> = {}): Promise<T> {
    return metaGraphGet<T>(loadEnv().META_GRAPH_API_VERSION, urlOrPath, params);
  }

  async listAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
    const body = await this.get<{ data?: { account_id: string; name?: string; currency?: string }[] }>("/me/adaccounts", {
      access_token: accessToken,
      fields: "account_id,name,currency",
      limit: "50"
    });
    return (body.data ?? []).map((a) => ({ externalAccountId: a.account_id, name: a.name ?? null, currency: a.currency ?? null }));
  }

  // Per-ad, per-day spend for a window (shared with the scheduled sync in the worker).
  fetchInsights(accessToken: string, accountId: string, since: string, until: string): Promise<MetaInsightRow[]> {
    return fetchMetaInsights(loadEnv().META_GRAPH_API_VERSION, accessToken, accountId, since, until);
  }
}
