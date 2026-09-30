-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "lostReason" TEXT;

-- AlterTable
ALTER TABLE "SlaTimer" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

