import { Global, Module } from "@nestjs/common";
import { RoutingModule } from "../routing/routing.module";
import { ApiKeyGuard } from "./api-key.guard";
import { ApiKeysService } from "./api-keys.service";
import { DevelopersController } from "./developers.controller";
import { PublicApiController } from "./public-api.controller";
import { PublicApiService } from "./public-api.service";
import { WebhooksService } from "./webhooks.service";

// Global so any feature (leads, calendar, link in bio...) can emit a webhook
// event without importing this module.
@Global()
@Module({
  imports: [RoutingModule],
  controllers: [DevelopersController, PublicApiController],
  providers: [ApiKeysService, ApiKeyGuard, WebhooksService, PublicApiService],
  exports: [WebhooksService]
})
export class DevelopersModule {}
