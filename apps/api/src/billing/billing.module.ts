import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { BillingController, RazorpayWebhookController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { PlanConfigService } from "./plan-config.service";
import { RazorpayClient } from "./razorpay.client";
import { UsageService } from "./usage.service";

@Module({
  imports: [NotificationsModule],
  controllers: [BillingController, RazorpayWebhookController],
  providers: [BillingService, RazorpayClient, UsageService, PlanConfigService],
  exports: [UsageService, PlanConfigService]
})
export class BillingModule {}
