import { Module } from "@nestjs/common";
import { FlowTemplatesController } from "./flow-templates.controller";
import { FlowTemplatesService } from "./flow-templates.service";

@Module({
  controllers: [FlowTemplatesController],
  providers: [FlowTemplatesService]
})
export class FlowTemplatesModule {}
