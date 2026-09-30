import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { BillingModule } from "../billing/billing.module";
import { MetaGraphClient } from "../channels/meta-graph.client";
import { InboxController } from "./inbox.controller";
import { InboxService } from "./inbox.service";

@Module({
  imports: [AiModule, BillingModule],
  controllers: [InboxController],
  providers: [InboxService, MetaGraphClient]
})
export class InboxModule {}
