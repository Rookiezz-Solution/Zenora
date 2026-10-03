import { Module } from "@nestjs/common";
import { AutomationsController } from "./automations.controller";
import { AutomationsService } from "./automations.service";
import { TriggerEventsService } from "./trigger-events.service";

@Module({
  controllers: [AutomationsController],
  providers: [AutomationsService, TriggerEventsService],
  exports: [TriggerEventsService]
})
export class AutomationsModule {}
