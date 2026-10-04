-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "deletionScheduledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RetainedInvoice" (
    "id" TEXT NOT NULL,
    "originalInvoiceId" TEXT NOT NULL,
    "formerWorkspaceId" TEXT NOT NULL,
    "businessName" TEXT,
    "gstin" TEXT,
    "billingAddress" TEXT,
    "description" TEXT NOT NULL,
    "amountInr" INTEGER NOT NULL,
    "gstInr" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retainUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetainedInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetainedInvoice_originalInvoiceId_key" ON "RetainedInvoice"("originalInvoiceId");

-- CreateIndex
CREATE INDEX "RetainedInvoice_formerWorkspaceId_idx" ON "RetainedInvoice"("formerWorkspaceId");

-- CreateIndex
CREATE INDEX "RetainedInvoice_retainUntil_idx" ON "RetainedInvoice"("retainUntil");

