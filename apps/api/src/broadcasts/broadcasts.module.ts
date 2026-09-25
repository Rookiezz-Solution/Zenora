import { Module } from "@nestjs/common";
import { MetaGraphClient } from "../channels/meta-graph.client";
import { BroadcastsController } from "./broadcasts.controller";
import { BroadcastsService } from "./broadcasts.service";

@Module({
  controllers: [BroadcastsController],
  providers: [BroadcastsService, MetaGraphClient]
})
export class BroadcastsModule {}
