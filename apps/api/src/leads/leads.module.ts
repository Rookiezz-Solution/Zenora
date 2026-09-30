import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { BillingModule } from "../billing/billing.module";
import { RoutingModule } from "../routing/routing.module";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

@Module({
  imports: [RoutingModule, BillingModule, AiModule],
  controllers: [LeadsController],
  providers: [LeadsService]
})
export class LeadsModule {}
