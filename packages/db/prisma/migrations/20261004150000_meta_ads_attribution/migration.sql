-- AlterTable
ALTER TABLE "AdAccount" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "name" TEXT,
ADD COLUMN     "tokenExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "adId" TEXT,
ADD COLUMN     "adReferral" JSONB;

-- CreateTable
CREATE TABLE "AdDailyStat" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "adName" TEXT,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "spendMinor" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdDailyStat_workspaceId_date_idx" ON "AdDailyStat"("workspaceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AdDailyStat_adAccountId_date_adId_key" ON "AdDailyStat"("adAccountId", "date", "adId");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccount_workspaceId_provider_externalAccountId_key" ON "AdAccount"("workspaceId", "provider", "externalAccountId");

-- CreateIndex
CREATE INDEX "Lead_workspaceId_adId_idx" ON "Lead"("workspaceId", "adId");

-- AddForeignKey
ALTER TABLE "AdDailyStat" ADD CONSTRAINT "AdDailyStat_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

