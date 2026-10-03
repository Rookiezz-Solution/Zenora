-- DropIndex
DROP INDEX "AppointmentType_workspaceId_slug_key";

-- AlterTable
ALTER TABLE "AppointmentType" DROP COLUMN "slug";

