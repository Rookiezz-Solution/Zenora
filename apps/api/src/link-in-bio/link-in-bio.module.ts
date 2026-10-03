import { Module } from "@nestjs/common";
import { RoutingModule } from "../routing/routing.module";
import { LinkInBioController, PublicLinkInBioController } from "./link-in-bio.controller";
import { LinkInBioService } from "./link-in-bio.service";

@Module({
  imports: [RoutingModule],
  controllers: [LinkInBioController, PublicLinkInBioController],
  providers: [LinkInBioService]
})
export class LinkInBioModule {}
