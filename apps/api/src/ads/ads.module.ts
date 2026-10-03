import { Module } from "@nestjs/common";
import { MetaGraphClient } from "../channels/meta-graph.client";
import { AdsController, MetaAdsCallbackController } from "./ads.controller";
import { AdsService } from "./ads.service";
import { MetaAdsClient } from "./meta-ads.client";

@Module({
  // Callback controller first so "ads/meta/callback" is never read as
  // "ads/:workspaceId/<something>".
  controllers: [MetaAdsCallbackController, AdsController],
  providers: [AdsService, MetaAdsClient, MetaGraphClient]
})
export class AdsModule {}
