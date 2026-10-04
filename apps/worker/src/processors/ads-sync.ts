import { prisma } from "@zenora/db";
import { fetchMetaInsights, toAdStatData } from "@zenora/shared";
import { decryptToken } from "../decrypt-token";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const SYNC_DAYS = 7; // Meta restates the last few days; the 30-day backfill stays a manual "Sync now"
const MIN_GAP_HOURS = 5; // so a worker restart does not re-pull what was just pulled
const MAX_ACCOUNTS = 500;
const UPSERT_CHUNK = 100;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Runs every 6 hours: refreshes the last week of ad spend for every tracked Meta
// ad account, so Ads and sources stays current without anybody pressing
// "Sync now". Same code and same stored rows as the manual sync; an account
// that fails (expired access, Meta error) is marked so the page can ask the
// owner to reconnect, and the others carry on.
export async function processAdsSync(now: Date = new Date()): Promise<{ accounts: number; rows: number; failed: number }> {
  const accounts = await prisma.adAccount.findMany({
    where: {
      provider: "meta",
      status: { in: ["active", "error"] },
      accessTokenCipher: { not: null },
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(now.getTime() - MIN_GAP_HOURS * HOUR_MS) } }]
    },
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    take: MAX_ACCOUNTS
  });

  const graphVersion = process.env.META_GRAPH_API_VERSION || "v21.0";
  const since = isoDay(new Date(now.getTime() - SYNC_DAYS * DAY_MS));
  const until = isoDay(now);
  let rows = 0;
  let failed = 0;

  for (const account of accounts) {
    try {
      const insights = await fetchMetaInsights(graphVersion, decryptToken(account.accessTokenCipher!), account.externalAccountId, since, until);
      for (let i = 0; i < insights.length; i += UPSERT_CHUNK) {
        await prisma.$transaction(
          insights.slice(i, i + UPSERT_CHUNK).map((r) => {
            const data = toAdStatData(r);
            return prisma.adDailyStat.upsert({
              where: { adAccountId_date_adId: { adAccountId: account.id, date: r.date, adId: r.adId } },
              create: { workspaceId: account.workspaceId, adAccountId: account.id, date: r.date, adId: r.adId, ...data },
              update: data
            });
          })
        );
      }
      rows += insights.length;
      await prisma.adAccount.update({ where: { id: account.id }, data: { status: "active", lastError: null, lastSyncedAt: now } });
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message.slice(0, 300) : "Sync failed";
      console.error(`Ad sync failed for account ${account.id}: ${message}`);
      await prisma.adAccount.update({ where: { id: account.id }, data: { status: "error", lastError: message } }).catch(() => undefined);
    }
  }
  return { accounts: accounts.length, rows, failed };
}
