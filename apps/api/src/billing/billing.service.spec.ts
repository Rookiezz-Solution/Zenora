import { UnauthorizedException } from "@nestjs/common";
import { DEFAULT_PLAN_CONFIG, setPlanConfig } from "@zenora/shared";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { ReferralsService } from "../referrals/referrals.service";
import { BillingService } from "./billing.service";
import type { RazorpayClient } from "./razorpay.client";
import type { UsageService } from "./usage.service";

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
  const referrals = { accrueForPayment: vi.fn().mockResolvedValue(undefined) };
  const usage = { resetCreditsToPlan: vi.fn().mockResolvedValue(undefined) };
  return { service: new BillingService({ client } as unknown as PrismaService, razorpay, referrals as unknown as ReferralsService, usage as unknown as UsageService), razorpay, referrals, usage };
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
    const { service, referrals } = makeService(client, razorpay);

    await service.confirmPayment("ws1", { razorpayOrderId: "o1", razorpayPaymentId: "p1", razorpaySignature: "sig" });
    expect(referrals.accrueForPayment).toHaveBeenCalledWith("p1"); // referral commission is computed once the invoice exists

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

describe("BillingService price locking", () => {
  it("puts the price shown to the customer into the Razorpay order", async () => {
    const createOrder = vi.fn().mockResolvedValue({ id: "o1" });
    const { service } = makeService(makeClient(), makeRazorpay({ createOrder }));
    await service.createCheckoutOrder("ws1", { kind: "plan", planId: "growth", billingCycle: "monthly" } as never);

    expect(createOrder.mock.calls[0]![2]).toMatchObject({ workspaceId: "ws1", kind: "plan", baseInr: "3999", gstInr: "720" });
  });

  it("invoices the locked amount even if the price was changed after the order was created", async () => {
    const client = makeClient();
    const razorpay = makeRazorpay({
      getOrder: vi.fn().mockResolvedValue({
        id: "o1",
        notes: { workspaceId: "ws1", kind: "plan", payload: JSON.stringify({ kind: "plan", planId: "growth", billingCycle: "monthly" }), baseInr: "3999", gstInr: "720" }
      })
    });
    const { service } = makeService(client, razorpay);
    setPlanConfig({ ...DEFAULT_PLAN_CONFIG, plans: { ...DEFAULT_PLAN_CONFIG.plans, growth: { ...DEFAULT_PLAN_CONFIG.plans.growth, priceInr: 5499 } } });
    try {
      await service.confirmPayment("ws1", { razorpayOrderId: "o1", razorpayPaymentId: "p9", razorpaySignature: "sig" });
    } finally {
      setPlanConfig(DEFAULT_PLAN_CONFIG);
    }

    expect(client.invoice.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountInr: 3999, gstInr: 720 }) }));
  });

  it("falls back to the current price for an order created before locking existed", async () => {
    const client = makeClient();
    const razorpay = makeRazorpay({
      getOrder: vi.fn().mockResolvedValue({ id: "o1", notes: { workspaceId: "ws1", kind: "plan", payload: JSON.stringify({ kind: "plan", planId: "growth", billingCycle: "monthly" }) } })
    });
    const { service } = makeService(client, razorpay);
    await service.confirmPayment("ws1", { razorpayOrderId: "o1", razorpayPaymentId: "p10", razorpaySignature: "sig" });
    expect(client.invoice.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountInr: 3999 }) }));
  });
});

describe("BillingService plan changes and renewals", () => {
  const order = (planId: string) => ({ getOrder: vi.fn().mockResolvedValue({ id: "o1", notes: { workspaceId: "ws1", kind: "plan", payload: JSON.stringify({ kind: "plan", planId, billingCycle: "monthly" }) } }) });
  const day = 86_400_000;

  it("resets AI credits to the new plan when the plan changes", async () => {
    const { service, usage } = makeService(makeClient(), makeRazorpay(order("growth")));
    await service.confirmPayment("ws1", { razorpayOrderId: "o1", razorpayPaymentId: "pc1", razorpaySignature: "sig" });
    expect(usage.resetCreditsToPlan).toHaveBeenCalledWith("ws1");
  });

  it("adds a renewal on the same plan to the time left, and leaves the credits alone", async () => {
    const client = makeClient();
    const endsIn10 = new Date(Date.now() + 10 * day);
    client.subscription.findUnique.mockResolvedValue({ planId: "growth", status: "active", currentPeriodEnd: endsIn10 });
    const { service, usage } = makeService(client, makeRazorpay(order("growth")));
    await service.confirmPayment("ws1", { razorpayOrderId: "o1", razorpayPaymentId: "pc2", razorpaySignature: "sig" });
    const update = client.subscription.upsert.mock.calls[0]![0].update;
    expect(update.currentPeriodEnd.getTime()).toBe(endsIn10.getTime() + 30 * day);
    expect(usage.resetCreditsToPlan).not.toHaveBeenCalled();
  });

  it("starts the period from today for a lapsed plan, and ends the trial when paying", async () => {
    const client = makeClient();
    client.subscription.findUnique.mockResolvedValue({ planId: "growth", status: "trialing", trialEndsAt: new Date(Date.now() + 5 * day), currentPeriodEnd: null });
    const { service, usage } = makeService(client, makeRazorpay(order("growth")));
    const before = Date.now();
    await service.confirmPayment("ws1", { razorpayOrderId: "o1", razorpayPaymentId: "pc3", razorpaySignature: "sig" });
    const update = client.subscription.upsert.mock.calls[0]![0].update;
    expect(update.trialEndsAt).toBeNull();
    expect(update.currentPeriodEnd.getTime()).toBeGreaterThanOrEqual(before + 30 * day);
    expect(update.currentPeriodEnd.getTime()).toBeLessThan(before + 31 * day);
    expect(usage.resetCreditsToPlan).not.toHaveBeenCalled(); // already on Growth during the trial
  });

  it("still records the payment when the credit reset fails", async () => {
    const client = makeClient();
    const { service, usage } = makeService(client, makeRazorpay(order("pro")));
    usage.resetCreditsToPlan.mockRejectedValue(new Error("db down"));
    await expect(service.confirmPayment("ws1", { razorpayOrderId: "o1", razorpayPaymentId: "pc4", razorpaySignature: "sig" })).resolves.toEqual({ status: "paid" });
    expect(client.invoice.create).toHaveBeenCalled();
  });
});
