import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { buildAdsReport, parseSpendMinor, type AdLeadRow, type AdStatRow } from "@zenora/shared";
import { MetaGraphClient } from "../channels/meta-graph.client";
import { decryptToken, encryptToken } from "../common/encryption";
import { PrismaService } from "../prisma/prisma.service";
import { MetaAdsClient } from "./meta-ads.client";

const SYNC_DAYS = 30;
const MAX_REPORT_LEADS = 5000;
const DAY_MS = 86_400_000;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class AdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaAds: MetaAdsClient,
    private readonly metaGraph: MetaGraphClient
  ) {}

  // After the user logs in with Facebook: remember every ad account they can
  // see, all *inactive* — they pick which to track, so we never start pulling
  // an account they didn't choose.
  async handleCallback(code: string, workspaceId: string) {
    const short = await this.metaGraph.exchangeCodeForUserToken(code, this.metaAds.redirectUri());
    const { accessToken, expiresInSeconds } = await this.metaGraph.getLongLivedToken(short);
    const accounts = await this.metaAds.listAdAccounts(accessToken);
    const tokenExpiresAt = expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null;
    const accessTokenCipher = encryptToken(accessToken);

    for (const a of accounts) {
      const refreshed = { accessTokenCipher, tokenExpiresAt, name: a.name, currency: a.currency, lastError: null };
      const existing = await this.prisma.client.adAccount.findUnique({
        where: { workspaceId_provider_externalAccountId: { workspaceId, provider: "meta", externalAccountId: a.externalAccountId } }
      });
      if (existing) {
        // Reconnecting fixes an account that had errored out, but never turns tracking on or off.
        await this.prisma.client.adAccount.update({ where: { id: existing.id }, data: { ...refreshed, status: existing.status === "error" ? "active" : existing.status } });
      } else {
        await this.prisma.client.adAccount.create({
          data: { workspaceId, provider: "meta", externalAccountId: a.externalAccountId, status: "inactive", ...refreshed }
        });
      }
    }
    return { found: accounts.length };
  }

  // Never selects the token.
  listAccounts(workspaceId: string) {
    return this.prisma.client.adAccount.findMany({
      where: { workspaceId, provider: "meta" },
      select: { id: true, externalAccountId: true, name: true, currency: true, status: true, lastSyncedAt: true, lastError: true, tokenExpiresAt: true },
      orderBy: { connectedAt: "asc" }
    });
  }

  async setActive(workspaceId: string, id: string, active: boolean) {
    const result = await this.prisma.client.adAccount.updateMany({ where: { id, workspaceId }, data: { status: active ? "active" : "inactive" } });
    if (result.count === 0) throw new NotFoundException("Ad account not found");
    return { ok: true };
  }

  async disconnect(workspaceId: string, id: string) {
    const result = await this.prisma.client.adAccount.deleteMany({ where: { id, workspaceId } });
    if (result.count === 0) throw new NotFoundException("Ad account not found");
    return { ok: true };
  }

  // Pulls the last 30 days for every tracked account. Idempotent (upserts), so
  // re-running just refreshes numbers Meta restates. A failing account is
  // marked so the UI can ask the user to reconnect; the others still sync.
  async sync(workspaceId: string) {
    const accounts = await this.prisma.client.adAccount.findMany({
      where: { workspaceId, provider: "meta", status: { in: ["active", "error"] }, accessTokenCipher: { not: null } }
    });
    if (accounts.length === 0) throw new BadRequestException("Choose at least one ad account to track first");

    const until = isoDay(new Date());
    const since = isoDay(new Date(Date.now() - SYNC_DAYS * DAY_MS));
    const errors: { account: string; message: string }[] = [];
    let rows = 0;

    for (const account of accounts) {
      try {
        const insights = await this.metaAds.fetchInsights(decryptToken(account.accessTokenCipher!), account.externalAccountId, since, until);
        for (const r of insights) {
          const data = {
            adName: r.adName,
            campaignId: r.campaignId,
            campaignName: r.campaignName,
            spendMinor: parseSpendMinor(r.spend),
            impressions: Number.parseInt(r.impressions, 10) || 0,
            clicks: Number.parseInt(r.clicks, 10) || 0
          };
          await this.prisma.client.adDailyStat.upsert({
            where: { adAccountId_date_adId: { adAccountId: account.id, date: r.date, adId: r.adId } },
            create: { workspaceId, adAccountId: account.id, date: r.date, adId: r.adId, ...data },
            update: data
          });
        }
        rows += insights.length;
        await this.prisma.client.adAccount.update({ where: { id: account.id }, data: { status: "active", lastError: null, lastSyncedAt: new Date() } });
      } catch (err) {
        const message = err instanceof Error ? err.message.slice(0, 300) : "Sync failed";
        errors.push({ account: account.name ?? account.externalAccountId, message });
        await this.prisma.client.adAccount.update({ where: { id: account.id }, data: { status: "error", lastError: message } });
      }
    }
    return { accounts: accounts.length, rows, errors };
  }

  async report(workspaceId: string, days: number) {
    const sinceDate = new Date(Date.now() - days * DAY_MS);
    const [stats, leads] = await Promise.all([
      this.prisma.client.adDailyStat.findMany({
        where: { workspaceId, date: { gte: isoDay(sinceDate) } },
        include: { adAccount: { select: { currency: true } } }
      }),
      this.prisma.client.lead.findMany({
        where: { workspaceId, mergedIntoId: null, createdAt: { gte: sinceDate } },
        select: { id: true, adId: true, source: true, stage: { select: { type: true } } },
        take: MAX_REPORT_LEADS
      })
    ]);

    const appointments = await this.prisma.client.appointment.findMany({
      where: { workspaceId, status: "booked", leadId: { in: leads.map((l) => l.id) } },
      select: { leadId: true }
    });
    const withAppointment = new Set(appointments.map((a) => a.leadId));

    const statRows: AdStatRow[] = stats.map((s) => ({
      adId: s.adId,
      campaignId: s.campaignId,
      campaignName: s.campaignName,
      currency: s.adAccount.currency ?? "INR",
      spendMinor: s.spendMinor,
      impressions: s.impressions,
      clicks: s.clicks
    }));
    const leadRows: AdLeadRow[] = leads.map((l) => ({
      adId: l.adId,
      source: l.source,
      won: l.stage?.type === "won",
      hasAppointment: withAppointment.has(l.id)
    }));

    return { days, ...buildAdsReport(statRows, leadRows) };
  }
}
