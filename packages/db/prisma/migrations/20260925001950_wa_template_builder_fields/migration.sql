-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN     "sentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WaTemplate" ADD COLUMN     "footerText" TEXT,
ADD COLUMN     "headerText" TEXT,
ADD COLUMN     "headerType" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "metaTemplateId" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);
