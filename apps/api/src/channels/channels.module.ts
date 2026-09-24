import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { InstagramController } from "./instagram.controller";
import { InstagramService } from "./instagram.service";
import { MetaGraphClient } from "./meta-graph.client";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";
import { WhatsappController } from "./whatsapp.controller";
import { WhatsappService } from "./whatsapp.service";

@Module({
  imports: [AuthModule],
  controllers: [WebhooksController, InstagramController, WhatsappController],
  providers: [MetaGraphClient, WebhooksService, InstagramService, WhatsappService]
})
export class ChannelsModule {}
