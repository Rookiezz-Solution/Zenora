-- DropForeignKey
ALTER TABLE "Referral" DROP CONSTRAINT "Referral_referredWorkspaceId_fkey";

-- AlterTable
ALTER TABLE "Referral" ADD COLUMN     "referredName" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "referredWorkspaceId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredWorkspaceId_fkey" FOREIGN KEY ("referredWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Remember each referred business's name for referrals that already exist.
UPDATE "Referral" r SET "referredName" = w."name" FROM "Workspace" w WHERE r."referredWorkspaceId" = w."id";
