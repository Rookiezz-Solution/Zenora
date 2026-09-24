import { Injectable } from "@nestjs/common";
import { loadEnv } from "../config/env";

interface InstagramPage {
  pageId: string;
  pageAccessToken: string;
  igUserId: string;
  username?: string;
}

// Thin wrapper around the Meta Graph API calls Instagram connect and
// WhatsApp Embedded Signup need. docs/INTEGRATIONS.md: Instagram Graph API
// (Messaging), WhatsApp Cloud API as a Meta Tech Provider — official APIs
// only, no scraping (CLAUDE.md rule #1).
@Injectable()
export class MetaGraphClient {
  private baseUrl() {
    return `https://graph.facebook.com/${loadEnv().META_GRAPH_API_VERSION}`;
  }

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl()}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const res = await fetch(url, { method: "GET" });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(`Meta Graph API error (${path}): ${JSON.stringify(body)}`);
    }
    return body as T;
  }

  async exchangeCodeForUserToken(code: string, redirectUri: string): Promise<string> {
    const env = loadEnv();
    const body = await this.request<{ access_token: string }>("/oauth/access_token", {
      client_id: env.META_APP_ID ?? "",
      client_secret: env.META_APP_SECRET ?? "",
      redirect_uri: redirectUri,
      code
    });
    return body.access_token;
  }

  async getLongLivedToken(shortLivedToken: string): Promise<{ accessToken: string; expiresInSeconds?: number }> {
    const env = loadEnv();
    const body = await this.request<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: env.META_APP_ID ?? "",
      client_secret: env.META_APP_SECRET ?? "",
      fb_exchange_token: shortLivedToken
    });
    return { accessToken: body.access_token, expiresInSeconds: body.expires_in };
  }

  // A Facebook user can manage several Pages; each Page can have one linked
  // Instagram professional account. Onboarding lets the business pick which
  // one to connect.
  async listInstagramAccounts(userAccessToken: string): Promise<InstagramPage[]> {
    const body = await this.request<{
      data: Array<{
        id: string;
        access_token: string;
        instagram_business_account?: { id: string; username?: string };
      }>;
    }>("/me/accounts", {
      fields: "id,access_token,instagram_business_account{id,username}",
      access_token: userAccessToken
    });
    return body.data
      .filter((page) => page.instagram_business_account)
      .map((page) => ({
        pageId: page.id,
        pageAccessToken: page.access_token,
        igUserId: page.instagram_business_account!.id,
        username: page.instagram_business_account!.username
      }));
  }

  // Embedded Signup exchange: the `code` comes from the frontend JS SDK flow
  // (FB.login with the WhatsApp signup config). wabaId/phoneNumberId arrive
  // alongside it via the SDK's message event, not from this call.
  async exchangeWhatsappCode(code: string): Promise<string> {
    const env = loadEnv();
    const body = await this.request<{ access_token: string }>("/oauth/access_token", {
      client_id: env.META_APP_ID ?? "",
      client_secret: env.META_APP_SECRET ?? "",
      code
    });
    return body.access_token;
  }

  async subscribeWabaWebhooks(wabaId: string, accessToken: string): Promise<void> {
    const url = new URL(`${this.baseUrl()}/${wabaId}/subscribed_apps`);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      throw new Error(`Failed to subscribe WABA ${wabaId} to webhooks: ${await res.text()}`);
    }
  }

  async getPhoneNumberDetails(
    phoneNumberId: string,
    accessToken: string
  ): Promise<{ displayPhoneNumber: string }> {
    const body = await this.request<{ display_phone_number: string }>(`/${phoneNumberId}`, {
      fields: "display_phone_number",
      access_token: accessToken
    });
    return { displayPhoneNumber: body.display_phone_number };
  }

  private async post<T>(path: string, accessToken: string, payload: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseUrl()}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(`Meta Graph API error (${path}): ${JSON.stringify(body)}`);
    }
    return body as T;
  }

  // Instagram DMs go out via the connected IG business account, using the
  // Page access token stored for it.
  async sendInstagramMessage(igUserId: string, recipientId: string, text: string, accessToken: string): Promise<string> {
    const body = await this.post<{ message_id: string }>(`/${igUserId}/messages`, accessToken, {
      recipient: { id: recipientId },
      message: { text }
    });
    return body.message_id;
  }

  async sendWhatsappText(phoneNumberId: string, to: string, text: string, accessToken: string): Promise<string> {
    const body = await this.post<{ messages: Array<{ id: string }> }>(`/${phoneNumberId}/messages`, accessToken, {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    });
    return body.messages[0]!.id;
  }

  // Outside the 24h customer-service window, WhatsApp only allows sending a
  // pre-approved template (CLAUDE.md rule #5).
  async sendWhatsappTemplate(
    phoneNumberId: string,
    to: string,
    templateName: string,
    languageCode: string,
    accessToken: string
  ): Promise<string> {
    const body = await this.post<{ messages: Array<{ id: string }> }>(`/${phoneNumberId}/messages`, accessToken, {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: { name: templateName, language: { code: languageCode } }
    });
    return body.messages[0]!.id;
  }
}
