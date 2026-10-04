import { Module } from "@nestjs/common";
import { AutomationsModule } from "../automations/automations.module";
import { RoutingController } from "./routing.controller";
import { RoutingEngineService } from "./routing-engine.service";
import { RoutingRulesService } from "./routing-rules.service";

@Module({
  imports: [AutomationsModule],
  controllers: [RoutingController],
  providers: [RoutingRulesService, RoutingEngineService],
  exports: [RoutingEngineService]
})
export class RoutingModule {}
