import { BadRequestException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { computeCheckoutAmount, effectivePlanId, TOPUP_CREDITS, type CheckoutIntent } from "@zenora/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ReferralsService } from "../referrals/referrals.service";
import { NotificationsService } from "../notifications/notifications.service";
import { UsageService } from "./usage.service";
import { RazorpayClient } from "./razorpay.client";
import type { ConfirmPaymentDto, CreateCheckoutOrderDto, UpdateBillingProfileDto } from "./dto/billing.dto";

const DAY_MS = 86_400_000;

function lockedAmount(notes: Record<string, string> | undefined): { baseInr: number; gstInr: number } | null {
  const baseInr = Number(notes?.baseInr);
  const gstInr = Number(notes?.gstInr);
  return Number.isInteger(baseInr) && Number.isInteger(gstInr) && baseInr >= 0 && gstInr >= 0 && notes?.baseInr !== undefined ? { baseInr, gstInr } : null;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayClient,
    private readonly referrals: ReferralsService,
    private readonly usage: UsageService,
    private readonly notifications: NotificationsService
  ) {}

  async getOverview(workspaceId: string) {
    const [workspace, subscription, invoices, addons] = await Promise.all([
      this.prisma.client.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { planId: true, billingName: true, gstin: true, billingAddress: true }
      }),
      this.prisma.client.subscription.findUnique({ where: { workspaceId } }),
      this.prisma.client.invoice.findMany({ where: { workspaceId }, orderBy: { issuedAt: "desc" }, take: 50 }),
      this.prisma.client.workspaceAddon.findMany({ where: { workspaceId } })
    ]);
    return { workspace, subscription, invoices, addons };
  }

  async updateBillingProfile(workspaceId: string, dto: UpdateBillingProfileDto) {
    return this.prisma.client.workspace.update({ where: { id: workspaceId }, data: dto });
  }

  async createCheckoutOrder(workspaceId: string, dto: CreateCheckoutOrderDto) {
    const amount = computeCheckoutAmount(dto as CheckoutIntent);
    const receipt = `${workspaceId}_${Date.now()}`;
    const order = await this.razorpay.createOrder(amount.totalInr, receipt, {
      workspaceId,
      kind: dto.kind,
      payload: JSON.stringify(dto),
      // The price the customer was shown is locked into the order, so the invoice
      // matches what was charged even if a super admin changes prices before the
      // payment completes.
      baseInr: String(amount.baseInr),
      gstInr: String(amount.gstInr)
    });
    return {
      razorpayOrderId: order.id,
      description: amount.description,
      baseInr: amount.baseInr,
      gstInr: amount.gstInr,
      totalInr: amount.totalInr
    };
  }

  // Client-side checkout.js success callback — verified against the API
  // secret, then re-fetches the order from Razorpay to recover what it was
  // for (checkout.js only hands back the three ids, not our notes).
  async confirmPayment(workspaceId: string, dto: ConfirmPaymentDto) {
    if (!this.razorpay.verifyPaymentSignature(dto.razorpayOrderId, dto.razorpayPaymentId, dto.razorpaySignature)) {
      throw new UnauthorizedException("Invalid payment signature");
    }
    const order = await this.razorpay.getOrder(dto.razorpayOrderId);
    if (order.notes.workspaceId !== workspaceId) {
      throw new UnauthorizedException("Order does not belong to this workspace");
    }
    const intent = JSON.parse(order.notes.payload ?? "{}") as CheckoutIntent;
    await this.applyPayment(workspaceId, intent, dto.razorpayOrderId, dto.razorpayPaymentId, lockedAmount(order.notes));
    await this.referrals.accrueForPayment(dto.razorpayPaymentId);
    return { status: "paid" };
  }

  // Server-to-server source of truth — fires even if the browser closed
  // before the client-side callback ran.
  async handleWebhook(rawBody: string, signature: string): Promise<void> {
    if (!this.razorpay.verifyWebhookSignature(rawBody, signature)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
    const event = JSON.parse(rawBody) as { event: string; payload: { payment?: { entity: RazorpayPaymentEntity }; refund?: { entity: RazorpayRefundEntity } } };
    if (event.event === "refund.processed" && event.payload.refund) {
      await this.applyRefund(event.payload.refund.entity);
      return;
    }
    if (event.event !== "payment.captured" || !event.payload.payment) return;

    const payment = event.payload.payment.entity;
    const workspaceId = payment.notes?.workspaceId;
    if (!workspaceId) {
      this.logger.warn(`Webhook payment ${payment.id} has no workspaceId in notes — ignoring`);
      return;
    }
    const intent = JSON.parse(payment.notes.payload ?? "{}") as CheckoutIntent;
    await this.applyPayment(workspaceId, intent, payment.order_id, payment.id, lockedAmount(payment.notes));
    await this.referrals.accrueForPayment(payment.id);
  }

  // A refund Razorpay has finished processing. A full refund marks the invoice
  // refunded and takes back the referral commission it earned. Anything partial
  // is only logged: how much commission or access that should change is a
  // judgement for the owner, not something to guess at. The customer's plan is
  // NOT changed automatically either — end it from the owner console if needed.
  private async applyRefund(refund: RazorpayRefundEntity): Promise<void> {
    const invoice = await this.prisma.client.invoice.findUnique({ where: { razorpayPaymentId: refund.payment_id } });
    if (!invoice) {
      this.logger.warn(`Refund ${refund.id} is for payment ${refund.payment_id}, which has no invoice here — ignoring`);
      return;
    }
    if (invoice.status === "refunded") return; // the same event can arrive more than once
    const totalPaise = (invoice.amountInr + invoice.gstInr) * 100;
    if (refund.amount < totalPaise) {
      this.logger.warn(`Partial refund ${refund.id} (${refund.amount / 100} of ${totalPaise / 100} INR) on invoice ${invoice.id}: left for the owner to handle`);
      return;
    }
    await this.prisma.client.invoice.update({ where: { id: invoice.id }, data: { status: "refunded" } });
    const commission = await this.referrals.reverseForRefund(invoice.id).catch((err) => {
      this.logger.error(`Could not reverse the commission for refunded invoice ${invoice.id}: ${err instanceof Error ? err.message : String(err)}`);
      return "none" as const;
    });
    this.logger.log(`Invoice ${invoice.id} refunded (commission: ${commission})`);
    await this.notifications
      .create({ workspaceId: invoice.workspaceId, type: "payment_refunded", title: "A refund was issued", body: `₹${invoice.amountInr + invoice.gstInr} for "${invoice.description}" has been refunded.` })
      .catch(() => undefined);
  }

  private async applyPayment(workspaceId: string, intent: CheckoutIntent, orderId: string, paymentId: string, locked: { baseInr: number; gstInr: number } | null = null): Promise<void> {
    const existing = await this.prisma.client.invoice.findUnique({ where: { razorpayPaymentId: paymentId } });
    if (existing) return; // webhook + client-confirm can both fire for the same payment

    const computed = computeCheckoutAmount(intent);
    // Orders made before price locking existed carry no amount; they fall back to the current price.
    const amount = locked ? { ...computed, baseInr: locked.baseInr, gstInr: locked.gstInr, totalInr: locked.baseInr + locked.gstInr } : computed;
    const now = new Date();

    if (intent.kind === "plan") {
      const existing = await this.prisma.client.subscription.findUnique({ where: { workspaceId } });
      const previousPlan = effectivePlanId(existing, now);
      // Paying again for the plan you are already on adds to the time left
      // instead of throwing it away; a new plan starts from today.
      const runsUntil = previousPlan === intent.planId && existing?.status !== "trialing" ? existing?.currentPeriodEnd : null;
      const start = runsUntil && runsUntil.getTime() > now.getTime() ? runsUntil : now;
      const periodEnd = new Date(start.getTime() + (intent.billingCycle === "yearly" ? 365 : 30) * DAY_MS);
      await this.prisma.client.$transaction([
        this.prisma.client.subscription.upsert({
          where: { workspaceId },
          update: { planId: intent.planId, status: "active", billingCycle: intent.billingCycle, currentPeriodEnd: periodEnd, trialEndsAt: null },
          create: { workspaceId, planId: intent.planId, status: "active", billingCycle: intent.billingCycle, currentPeriodEnd: periodEnd }
        }),
        this.prisma.client.workspace.update({ where: { id: workspaceId }, data: { planId: intent.planId } }),
        this.prisma.client.invoice.create({
          data: {
            workspaceId,
            description: amount.description,
            amountInr: amount.baseInr,
            gstInr: amount.gstInr,
            status: "paid",
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId,
            periodStart: now,
            periodEnd
          }
        })
      ]);
      if (previousPlan !== intent.planId) {
        // The invoice is already written, so a failure here must not make the payment look failed.
        await this.usage.resetCreditsToPlan(workspaceId).catch((err) => this.logger.warn(`Could not reset AI credits after a plan change: ${err instanceof Error ? err.message : String(err)}`));
      }
      return;
    }

    if (intent.kind === "addon") {
      const periodEnd = new Date(now.getTime() + 30 * DAY_MS);
      await this.prisma.client.$transaction([
        this.prisma.client.workspaceAddon.create({ data: { workspaceId, addonKey: intent.addonKey, quantity: intent.quantity } }),
        this.prisma.client.invoice.create({
          data: {
            workspaceId,
            description: amount.description,
            amountInr: amount.baseInr,
            gstInr: amount.gstInr,
            status: "paid",
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId,
            periodStart: now,
            periodEnd
          }
        })
      ]);
      return;
    }

    // topup
    const credits = TOPUP_CREDITS[intent.topupKey];
    const last = await this.prisma.client.creditLedger.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
    const balanceAfter = (last?.balanceAfter ?? 0) + credits;
    await this.prisma.client.$transaction([
      this.prisma.client.creditLedger.create({ data: { workspaceId, delta: credits, reason: "topup", balanceAfter } }),
      this.prisma.client.invoice.create({
        data: {
          workspaceId,
          description: amount.description,
          amountInr: amount.baseInr,
          gstInr: amount.gstInr,
          status: "paid",
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          periodStart: now,
          periodEnd: now
        }
      })
    ]);
  }

  // No proration or scheduled downgrade-at-period-end — immediate, simplest
  // possible state flip (docs/PROGRESS.md Phase 1 item 9 simplifications).
  async cancelSubscription(workspaceId: string) {
    await this.prisma.client.$transaction([
      this.prisma.client.subscription.updateMany({ where: { workspaceId }, data: { status: "canceled" } }),
      this.prisma.client.workspace.update({ where: { id: workspaceId }, data: { planId: "free" } })
    ]);
  }

  async pauseSubscription(workspaceId: string) {
    const result = await this.prisma.client.subscription.updateMany({ where: { workspaceId }, data: { status: "paused" } });
    if (result.count === 0) throw new BadRequestException("No active subscription to pause");
  }
}

interface RazorpayRefundEntity {
  id: string;
  payment_id: string;
  amount: number; // paise
}

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  notes: { workspaceId?: string; kind?: string; payload?: string };
}
