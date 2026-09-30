import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { BillingService } from "./billing.service";
import { confirmPaymentSchema, createCheckoutOrderSchema, updateBillingProfileSchema } from "./dto/billing.dto";
import { UsageService } from "./usage.service";

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@Controller("billing/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly usage: UsageService
  ) {}

  @Get()
  @RequirePermission("billing.manage")
  overview(@Param("workspaceId") workspaceId: string) {
    return this.billing.getOverview(workspaceId);
  }

  // Read-only and visible to every role — feeds the sidebar's AI credits
  // meter and any "approaching your limit" banners, not just the owner.
  @Get("usage")
  @RequirePermission("leads.read")
  usageSummary(@Param("workspaceId") workspaceId: string) {
    return this.usage.getUsage(workspaceId);
  }

  @Post("profile")
  @RequirePermission("billing.manage")
  updateProfile(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(updateBillingProfileSchema)) body: unknown) {
    return this.billing.updateBillingProfile(workspaceId, body as never);
  }

  @Post("checkout")
  @RequirePermission("billing.manage")
  checkout(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(createCheckoutOrderSchema)) body: unknown) {
    return this.billing.createCheckoutOrder(workspaceId, body as never);
  }

  @Post("confirm")
  @RequirePermission("billing.manage")
  confirm(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(confirmPaymentSchema)) body: unknown) {
    return this.billing.confirmPayment(workspaceId, body as never);
  }

  @Post("cancel")
  @RequirePermission("billing.manage")
  cancel(@Param("workspaceId") workspaceId: string) {
    return this.billing.cancelSubscription(workspaceId);
  }

  @Post("pause")
  @RequirePermission("billing.manage")
  pause(@Param("workspaceId") workspaceId: string) {
    return this.billing.pauseSubscription(workspaceId);
  }
}

// Razorpay's webhook is workspace-agnostic (the workspace is inside the
// payload's notes) and unauthenticated — signature verification in
// BillingService.handleWebhook is what stands in for auth here, same shape
// as the Meta webhook's HMAC guard.
@Controller("webhooks/razorpay")
export class RazorpayWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post()
  async receive(@Req() req: RawBodyRequest, @Headers("x-razorpay-signature") signature: string) {
    const rawBody = (req.rawBody ?? Buffer.from(JSON.stringify(req.body))).toString("utf8");
    await this.billing.handleWebhook(rawBody, signature ?? "");
    return { received: true };
  }
}
