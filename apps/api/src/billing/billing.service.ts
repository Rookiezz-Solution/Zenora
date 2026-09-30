import { BadRequestException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { computeCheckoutAmount, TOPUP_CREDITS, type CheckoutIntent } from "@zenora/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RazorpayClient } from "./razorpay.client";
import type { ConfirmPaymentDto, CreateCheckoutOrderDto, UpdateBillingProfileDto } from "./dto/billing.dto";

const DAY_MS = 86_400_000;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayClient
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
      payload: JSON.stringify(dto)
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
    await this.applyPayment(workspaceId, intent, dto.razorpayOrderId, dto.razorpayPaymentId);
    return { status: "paid" };
  }

  // Server-to-server source of truth — fires even if the browser closed
  // before the client-side callback ran.
  async handleWebhook(rawBody: string, signature: string): Promise<void> {
    if (!this.razorpay.verifyWebhookSignature(rawBody, signature)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
    const event = JSON.parse(rawBody) as { event: string; payload: { payment?: { entity: RazorpayPaymentEntity } } };
    if (event.event !== "payment.captured" || !event.payload.payment) return;

    const payment = event.payload.payment.entity;
    const workspaceId = payment.notes?.workspaceId;
    if (!workspaceId) {
      this.logger.warn(`Webhook payment ${payment.id} has no workspaceId in notes — ignoring`);
      return;
    }
    const intent = JSON.parse(payment.notes.payload ?? "{}") as CheckoutIntent;
    await this.applyPayment(workspaceId, intent, payment.order_id, payment.id);
  }

  private async applyPayment(workspaceId: string, intent: CheckoutIntent, orderId: string, paymentId: string): Promise<void> {
    const existing = await this.prisma.client.invoice.findUnique({ where: { razorpayPaymentId: paymentId } });
    if (existing) return; // webhook + client-confirm can both fire for the same payment

    const amount = computeCheckoutAmount(intent);
    const now = new Date();

    if (intent.kind === "plan") {
      const periodEnd = new Date(now.getTime() + (intent.billingCycle === "yearly" ? 365 : 30) * DAY_MS);
      await this.prisma.client.$transaction([
        this.prisma.client.subscription.upsert({
          where: { workspaceId },
          update: { planId: intent.planId, status: "active", billingCycle: intent.billingCycle, currentPeriodEnd: periodEnd },
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

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  notes: { workspaceId?: string; kind?: string; payload?: string };
}
