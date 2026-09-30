import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { RoutingModule } from "../routing/routing.module";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

@Module({
  imports: [RoutingModule, BillingModule],
  controllers: [LeadsController],
  providers: [LeadsService]
})
export class LeadsModule {}
