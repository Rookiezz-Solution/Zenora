import { BadRequestException, Injectable } from "@nestjs/common";
import { loadEnv } from "../config/env";
import type { Interval } from "@zenora/shared";

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy"
].join(" ");

export interface CalendarEventInput {
  summary: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
}

// Thin wrapper over Google's OAuth + Calendar REST APIs. Each team member
// connects their own account by signing in with Google; Zenora keeps only an
// encrypted refresh token. Structurally complete and unit-tested with mocked
// responses — no Google OAuth client credentials exist in this environment.
@Injectable()
export class GoogleCalendarClient {
  private credentials() {
    const env = loadEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new BadRequestException("Google Calendar isn't configured yet — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
    }
    return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }

  redirectUri(): string {
    return `${loadEnv().API_URL}/calendar/google/callback`;
  }

  buildAuthUrl(state: string): string {
    const { clientId } = this.credentials();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", this.redirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("access_type", "offline"); // refresh token
    url.searchParams.set("prompt", "consent"); // always return a refresh token
    url.searchParams.set("state", state);
    return url.toString();
  }

  private async tokenRequest(params: Record<string, string>) {
    const { clientId, clientSecret } = this.credentials();
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params })
    });
    const body = (await res.json()) as { access_token?: string; refresh_token?: string; id_token?: string };
    if (!res.ok || !body.access_token) throw new Error(`Google token request failed: ${JSON.stringify(body)}`);
    return body;
  }

  async exchangeCode(code: string): Promise<{ refreshToken: string; email: string | null }> {
    const body = await this.tokenRequest({ code, grant_type: "authorization_code", redirect_uri: this.redirectUri() });
    if (!body.refresh_token) throw new Error("Google did not return a refresh token");
    // The id_token came straight from Google over TLS, so its payload is read
    // without re-verifying the signature — it's only used to show which
    // account was connected.
    let email: string | null = null;
    try {
      const payload = JSON.parse(Buffer.from(body.id_token!.split(".")[1]!, "base64url").toString()) as { email?: string };
      email = payload.email ?? null;
    } catch {
      email = null;
    }
    return { refreshToken: body.refresh_token, email };
  }

  async accessTokenFor(refreshToken: string): Promise<string> {
    const body = await this.tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
    return body.access_token!;
  }

  async freeBusy(accessToken: string, from: Date, to: Date): Promise<Interval[]> {
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: "primary" }] })
    });
    const body = (await res.json()) as { calendars?: { primary?: { busy?: { start: string; end: string }[] } } };
    if (!res.ok) throw new Error(`Google freeBusy failed: ${JSON.stringify(body)}`);
    return (body.calendars?.primary?.busy ?? []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
  }

  async createEvent(accessToken: string, event: CalendarEventInput): Promise<string> {
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.startsAt.toISOString() },
        end: { dateTime: event.endsAt.toISOString() }
      })
    });
    const body = (await res.json()) as { id?: string };
    if (!res.ok || !body.id) throw new Error(`Google event creation failed: ${JSON.stringify(body)}`);
    return body.id;
  }

  async updateEvent(accessToken: string, eventId: string, event: Pick<CalendarEventInput, "startsAt" | "endsAt">): Promise<void> {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ start: { dateTime: event.startsAt.toISOString() }, end: { dateTime: event.endsAt.toISOString() } })
    });
    if (!res.ok) throw new Error(`Google event update failed: ${res.status}`);
  }

  // 404 / 410 mean it is already gone, which is what we wanted.
  async deleteEvent(accessToken: string, eventId: string): Promise<void> {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Google event delete failed: ${res.status}`);
  }
}
