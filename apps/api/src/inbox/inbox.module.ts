import { Module } from "@nestjs/common";
import { MetaGraphClient } from "../channels/meta-graph.client";
import { InboxController } from "./inbox.controller";
import { InboxService } from "./inbox.service";

@Module({
  controllers: [InboxController],
  providers: [InboxService, MetaGraphClient]
})
export class InboxModule {}
