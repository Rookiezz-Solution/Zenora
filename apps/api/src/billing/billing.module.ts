import { Module } from "@nestjs/common";
import { BillingController, RazorpayWebhookController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { RazorpayClient } from "./razorpay.client";
import { UsageService } from "./usage.service";

@Module({
  controllers: [BillingController, RazorpayWebhookController],
  providers: [BillingService, RazorpayClient, UsageService],
  exports: [UsageService]
})
export class BillingModule {}
