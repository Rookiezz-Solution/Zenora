-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "reminderError" TEXT,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ADD COLUMN     "reminderStatus" TEXT;

-- AlterTable
ALTER TABLE "AppointmentType" ADD COLUMN     "reminderHoursBefore" INTEGER,
ADD COLUMN     "reminderTemplateId" TEXT;

