-- AlterTable
ALTER TABLE "Stage" ADD COLUMN     "countsAsQualified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "qualifiedMinScore" INTEGER;

