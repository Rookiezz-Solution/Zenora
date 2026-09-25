-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "available" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "slaMinutes" INTEGER NOT NULL DEFAULT 30;
