import { Module } from "@nestjs/common";
import { RoutingModule } from "../routing/routing.module";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

@Module({
  imports: [RoutingModule],
  controllers: [LeadsController],
  providers: [LeadsService]
})
export class LeadsModule {}
