import { Prisma, prisma } from "@zenora/db";
import { invoiceRetainUntil } from "@zenora/shared";

// Permanently removes a workspace whose owner asked for it and whose grace
// period has passed. Ordered so a crash part-way is safe to simply run again:
//   1. copy the invoices aside (tax records must outlive the customer);
//   2. remove the raw channel payloads that mention the business's numbers;
//   3. remove the heavy and non-cascading tables explicitly;
//   4. delete the workspace, which cascades the rest.
export async function purgeWorkspace(workspaceId: string, now: Date = new Date()): Promise<{ invoicesRetained: number; messages: number }> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, billingName: true, gstin: true, billingAddress: true } });
  if (!ws) return { invoicesRetained: 0, messages: 0 };

  const invoices = await prisma.invoice.findMany({ where: { workspaceId } });
  if (invoices.length > 0) {
    await prisma.retainedInvoice.createMany({
      skipDuplicates: true,
      data: invoices.map((i) => ({
        originalInvoiceId: i.id,
        formerWorkspaceId: workspaceId,
        businessName: ws.billingName ?? ws.name,
        gstin: ws.gstin,
        billingAddress: ws.billingAddress,
        description: i.description,
        amountInr: i.amountInr,
        gstInr: i.gstInr,
        status: i.status,
        razorpayOrderId: i.razorpayOrderId,
        razorpayPaymentId: i.razorpayPaymentId,
        periodStart: i.periodStart,
        periodEnd: i.periodEnd,
        issuedAt: i.issuedAt,
        deletedAt: now,
        retainUntil: invoiceRetainUntil(i.issuedAt)
      }))
    });
  }

  // Raw webhook payloads carry customers' phone numbers and are keyed by the
  // business's own WhatsApp number / Instagram account.
  const [numbers, accounts] = await Promise.all([
    prisma.whatsappNumber.findMany({ where: { workspaceId }, select: { phoneNumberId: true } }),
    prisma.instagramAccount.findMany({ where: { workspaceId }, select: { igUserId: true } })
  ]);
  const needles = [...numbers.map((n) => n.phoneNumberId), ...accounts.map((a) => a.igUserId)].filter((v) => v && v.length >= 6);
  if (needles.length > 0) {
    const patterns = needles.map((n) => "%" + n.replace(/[\\%_]/g, "\\$&") + "%");
    await prisma.$executeRaw(Prisma.sql`DELETE FROM "MetaWebhookEvent" WHERE payload::text LIKE ANY (${patterns}::text[])`);
  }

  const messages = await prisma.message.deleteMany({ where: { conversation: { workspaceId } } });
  await prisma.conversation.deleteMany({ where: { workspaceId } });
  await prisma.task.deleteMany({ where: { workspaceId } });
  await prisma.slaTimer.deleteMany({ where: { workspaceId } });
  await prisma.platformAuditLog.deleteMany({ where: { workspaceId } });

  await prisma.workspace.delete({ where: { id: workspaceId } });
  return { invoicesRetained: invoices.length, messages: messages.count };
}

export async function processWorkspaceDeletions(now: Date = new Date()): Promise<{ deleted: number; failed: number }> {
  const due = await prisma.workspace.findMany({ where: { deletionScheduledAt: { lte: now } }, select: { id: true } });
  let deleted = 0;
  let failed = 0;
  for (const { id } of due) {
    try {
      const result = await purgeWorkspace(id, now);
      console.log(`Workspace ${id} deleted (invoices retained: ${result.invoicesRetained})`);
      deleted++;
    } catch (err) {
      // Left scheduled, so the next hourly run tries again.
      console.error(`Could not delete workspace ${id}:`, err);
      failed++;
    }
  }
  return { deleted, failed };
}
