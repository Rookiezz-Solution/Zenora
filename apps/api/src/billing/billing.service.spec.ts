import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { BillingService } from "./billing.service";
import type { RazorpayClient } from "./razorpay.client";

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    workspace: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    subscription: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    invoice: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    workspaceAddon: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    creditLedger: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    ...overrides
  };
}

function makeRazorpay(overrides: Partial<Record<keyof RazorpayClient, unknown>> = {}) {
  return {
    createOrder: vi.fn().mockResolvedValue({ id: "order_1", amount: 176900, currency: "INR", receipt: "r1", status: "created", notes: {} }),
    getOrder: vi.fn(),
    verifyWebhookSignature: vi.fn().mockReturnValue(true),
    verifyPaymentSignature: vi.fn().mockReturnValue(true),
    ...overrides
  } as unknown as RazorpayClient;
}

function makeService(client: ReturnType<typeof makeClient>, razorpay = makeRazorpay()) {
  return { service: new BillingService({ client } as unknown as PrismaService, razorpay), razorpay };
}

describe("BillingService.createCheckoutOrder", () => {
  it("creates a Razorpay order for the GST-inclusive total and stashes intent in notes", async () => {
    const client = makeClient();
    const { service, razorpay } = makeService(client);

    const result = await service.createCheckoutOrder("ws1", { kind: "plan", planId: "starter", billingCycle: "monthly" });

    expect(razorpay.createOrder).toHaveBeenCalledWith(
      1769,
      expect.stringContaining("ws1"),
      expect.objectContaining({ workspaceId: "ws1", kind: "plan" })
    );
    expect(result.totalInr).toBe(1769);
  });
});

describe("BillingService.confirmPayment", () => {
  it("rejects an invalid payment signature", async () => {
    const client = makeClient();
    const { service } = makeService(client, makeRazorpay({ verifyPaymentSignature: vi.fn().mockReturnValue(false) }));

    await expect(
      service.confirmPayment("ws1", { razorpayOrderId: "o1", razorpayPaymentId: "p1", razorpaySignature: "bad" })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects when the order belongs to a different workspace", async () => {
    const client = makeClient();
    const razorpay = makeRazorpay({
      getOrder: vi.fn().mockResolvedValue({ id: "o1", notes: { workspaceId: "other-ws" } })
    });
    const { service } = makeService(client, razorpay);

    await expect(
      service.confirmPayment("ws1", { razorpayOrderId: "o1", razorpayPaymentId: "p1", razorpaySignature: "sig" })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("activates the subscription and writes a paid invoice for a plan purchase", async () => {
    const client = makeClient();
    const razorpay = makeRazorpay({
      getOrder: vi.fn().mockResolvedValue({
        id: "o1",
        notes: { workspaceId: "ws1", kind: "plan", payload: JSON.stringify({ kind: "plan", planId: "growth", billingCycle: "monthly" }) }
      })
    });
    const { service } = makeService(client, razorpay);

    await service.confirmPayment("ws1", { razorpayOrderId: "o1", razorpayPaymentId: "p1", razorpaySignature: "sig" });

    expect(client.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws1" }, update: expect.objectContaining({ planId: "growth", status: "active" }) })
    );
    expect(client.workspace.update).toHaveBeenCalledWith({ where: { id: "ws1" }, data: { planId: "growth" } });
    expect(client.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "paid", razorpayPaymentId: "p1", amountInr: 3999, gstInr: 720 }) })
    );
  });
});

describe("BillingService.handleWebhook", () => {
  it("rejects an invalid webhook signature", async () => {
    const client = makeClient();
    const { service } = makeService(client, makeRazorpay({ verifyWebhookSignature: vi.fn().mockReturnValue(false) }));

    await expect(service.handleWebhook("{}", "bad-sig")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("ignores events other than payment.captured", async () => {
    const client = makeClient();
    const { service } = makeService(client);

    await service.handleWebhook(JSON.stringify({ event: "order.paid", payload: {} }), "sig");

    expect(client.invoice.create).not.toHaveBeenCalled();
  });

  it("grants credits for a top-up payment", async () => {
    const client = makeClient();
    const { service } = makeService(client);
    const body = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_1",
            order_id: "order_1",
            notes: { workspaceId: "ws1", kind: "topup", payload: JSON.stringify({ kind: "topup", topupKey: "credits1000" }) }
          }
        }
      }
    });

    await service.handleWebhook(body, "sig");

    expect(client.creditLedger.create).toHaveBeenCalledWith({
      data: { workspaceId: "ws1", delta: 1000, reason: "topup", balanceAfter: 1000 }
    });
  });

  it("is idempotent — a second webhook for the same payment id is a no-op", async () => {
    const client = makeClient({ invoice: { findUnique: vi.fn().mockResolvedValue({ id: "inv1" }), findMany: vi.fn().mockResolvedValue([]), create: vi.fn() } });
    const { service } = makeService(client);
    const body = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_1",
            order_id: "order_1",
            notes: { workspaceId: "ws1", kind: "topup", payload: JSON.stringify({ kind: "topup", topupKey: "credits1000" }) }
          }
        }
      }
    });

    await service.handleWebhook(body, "sig");

    expect(client.creditLedger.create).not.toHaveBeenCalled();
  });
});

describe("BillingService.cancelSubscription", () => {
  it("cancels the subscription and drops the workspace back to the free plan", async () => {
    const client = makeClient();
    const { service } = makeService(client);

    await service.cancelSubscription("ws1");

    expect(client.subscription.updateMany).toHaveBeenCalledWith({ where: { workspaceId: "ws1" }, data: { status: "canceled" } });
    expect(client.workspace.update).toHaveBeenCalledWith({ where: { id: "ws1" }, data: { planId: "free" } });
  });
});
