import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { MetaGraphClient } from "../channels/meta-graph.client";
import { BroadcastsController } from "./broadcasts.controller";
import { BroadcastsService } from "./broadcasts.service";

@Module({
  imports: [BillingModule],
  controllers: [BroadcastsController],
  providers: [BroadcastsService, MetaGraphClient]
})
export class BroadcastsModule {}
