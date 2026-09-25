import { Module } from "@nestjs/common";
import { MetaGraphClient } from "../channels/meta-graph.client";
import { TemplatesController } from "./templates.controller";
import { TemplatesService } from "./templates.service";

@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService, MetaGraphClient]
})
export class TemplatesModule {}
