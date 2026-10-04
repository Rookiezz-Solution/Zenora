import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import { BillingService } from "../billing/billing.service";
import type { RazorpayClient } from "../billing/razorpay.client";
import type { UsageService } from "../billing/usage.service";
import type { PrismaService } from "../prisma/prisma.service";
import { ReferralsService } from "./referrals.service";

// --- commissions ---------------------------------------------------------

function makeReferrals(client: Record<string, unknown>) {
  return new ReferralsService({ client } as unknown as PrismaService);
}

describe("ReferralsService.reverseForRefund", () => {
  const entryClient = (entry: Record<string, unknown> | null) => ({ commissionEntry: { findUnique: vi.fn().mockResolvedValue(entry), update: vi.fn() } });

  it("voids a commission that has not been paid out yet", async () => {
    const client = entryClient({ id: "c1", status: "accrued", refundedAt: null });
    expect(await makeReferrals(client).reverseForRefund("inv1")).toBe("voided");
    expect(client.commissionEntry.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { status: "void" } });
  });

  it("flags a commission that was already paid out, instead of pretending it never was", async () => {
    const client = entryClient({ id: "c1", status: "paid", refundedAt: null });
    expect(await makeReferrals(client).reverseForRefund("inv1")).toBe("clawback");
    const data = client.commissionEntry.update.mock.calls[0]![0].data;
    expect(data.refundedAt).toBeInstanceOf(Date);
    expect(data.status).toBeUndefined(); // stays "paid": the money really left
  });

  it("does nothing twice, and nothing when there was no commission", async () => {
    const already = entryClient({ id: "c1", status: "paid", refundedAt: new Date() });
    expect(await makeReferrals(already).reverseForRefund("inv1")).toBe("clawback");
    expect(already.commissionEntry.update).not.toHaveBeenCalled();
    expect(await makeReferrals(entryClient({ id: "c2", status: "void", refundedAt: null })).reverseForRefund("inv1")).toBe("none");
    expect(await makeReferrals(entryClient(null)).reverseForRefund("inv1")).toBe("none");
  });
});

describe("ReferralsService clawbacks", () => {
  it("lists what each referrer owes back, separately from what they are owed", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([]) // accrued
      .mockResolvedValueOnce([
        { amountInr: 300, referral: { referrerUserId: "u1" } },
        { amountInr: 200, referral: { referrerUserId: "u1" } }
      ]);
    const client = {
      commissionEntry: { findMany },
      user: { findMany: vi.fn().mockResolvedValue([{ id: "u1", email: "r@x.co", name: "Ravi" }]) },
      payout: { findMany: vi.fn().mockResolvedValue([]) }
    };
    const r = await makeReferrals(client).owed();
    expect(r.toRecover).toEqual([{ userId: "u1", email: "r@x.co", name: "Ravi", amountInr: 500, entries: 2 }]);
    expect(findMany.mock.calls[1]![0].where).toMatchObject({ status: "paid", refundedAt: { not: null }, clawbackRecoveredAt: null });
  });

  it("marks them recovered and audits it", async () => {
    const client = {
      commissionEntry: { findMany: vi.fn().mockResolvedValue([{ id: "c1", amountInr: 300 }]), updateMany: vi.fn() },
      platformAuditLog: { create: vi.fn() },
      $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops))
    };
    expect(await makeReferrals(client).markClawbackRecovered("admin1", "u1", "bank transfer ref 123")).toEqual({ recoveredInr: 300 });
    expect(client.commissionEntry.updateMany.mock.calls[0]![0].data.clawbackRecoveredAt).toBeInstanceOf(Date);
    expect(client.platformAuditLog.create.mock.calls[0]![0].data).toMatchObject({ userId: "admin1", action: "commission.clawback_recovered" });
  });

  it("refuses when nothing is owed back", async () => {
    const client = { commissionEntry: { findMany: vi.fn().mockResolvedValue([]) } };
    await expect(makeReferrals(client).markClawbackRecovered("admin1", "u1", "note here")).rejects.toThrow(NotFoundException);
  });
});

// --- the Razorpay webhook ---------------------------------------------------

function makeBilling(invoice: Record<string, unknown> | null) {
  const client = { invoice: { findUnique: vi.fn().mockResolvedValue(invoice), update: vi.fn() } };
  const referrals = { reverseForRefund: vi.fn().mockResolvedValue("voided") };
  const notifications = { create: vi.fn().mockResolvedValue({}) };
  const razorpay = { verifyWebhookSignature: vi.fn().mockReturnValue(true) } as unknown as RazorpayClient;
  const service = new BillingService({ client } as unknown as PrismaService, razorpay, referrals as never, {} as UsageService, notifications as unknown as NotificationsService);
  const refund = (amount: number) => JSON.stringify({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount } } } });
  return { service, client, referrals, notifications, refund };
}

const INVOICE = { id: "inv1", workspaceId: "ws1", amountInr: 1000, gstInr: 180, status: "paid", description: "Starter plan — monthly" };

describe("BillingService refund webhook", () => {
  it("marks a fully refunded invoice refunded, takes back the commission and tells the customer", async () => {
    const { service, client, referrals, notifications, refund } = makeBilling(INVOICE);
    await service.handleWebhook(refund(118_000), "sig");
    expect(client.invoice.findUnique).toHaveBeenCalledWith({ where: { razorpayPaymentId: "pay_1" } });
    expect(client.invoice.update).toHaveBeenCalledWith({ where: { id: "inv1" }, data: { status: "refunded" } });
    expect(referrals.reverseForRefund).toHaveBeenCalledWith("inv1");
    expect(notifications.create.mock.calls[0]![0]).toMatchObject({ workspaceId: "ws1", type: "payment_refunded" });
  });

  it("leaves a partial refund for the owner (no automatic change)", async () => {
    const { service, client, referrals, refund } = makeBilling(INVOICE);
    await service.handleWebhook(refund(50_000), "sig");
    expect(client.invoice.update).not.toHaveBeenCalled();
    expect(referrals.reverseForRefund).not.toHaveBeenCalled();
  });

  it("is idempotent: the same event twice changes nothing the second time", async () => {
    const { service, client, referrals, refund } = makeBilling({ ...INVOICE, status: "refunded" });
    await service.handleWebhook(refund(118_000), "sig");
    expect(client.invoice.update).not.toHaveBeenCalled();
    expect(referrals.reverseForRefund).not.toHaveBeenCalled();
  });

  it("ignores a refund for a payment it has no invoice for", async () => {
    const { service, client, refund } = makeBilling(null);
    await expect(service.handleWebhook(refund(118_000), "sig")).resolves.toBeUndefined();
    expect(client.invoice.update).not.toHaveBeenCalled();
  });

  it("still records the refund when reversing the commission fails", async () => {
    const { service, client, referrals, refund } = makeBilling(INVOICE);
    referrals.reverseForRefund.mockRejectedValue(new Error("db hiccup"));
    await service.handleWebhook(refund(118_000), "sig");
    expect(client.invoice.update).toHaveBeenCalled();
  });
});
