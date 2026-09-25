import { Module } from "@nestjs/common";
import { RoutingController } from "./routing.controller";
import { RoutingEngineService } from "./routing-engine.service";
import { RoutingRulesService } from "./routing-rules.service";

@Module({
  controllers: [RoutingController],
  providers: [RoutingRulesService, RoutingEngineService],
  exports: [RoutingEngineService]
})
export class RoutingModule {}
