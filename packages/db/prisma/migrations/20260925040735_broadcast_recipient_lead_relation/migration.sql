-- CreateIndex
CREATE INDEX "BroadcastRecipient_leadId_idx" ON "BroadcastRecipient"("leadId");

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
