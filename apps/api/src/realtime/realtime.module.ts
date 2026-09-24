import { Global, Module } from "@nestjs/common";
import { InboxGateway } from "./inbox.gateway";
import { RealtimeService } from "./realtime.service";

@Global()
@Module({
  providers: [RealtimeService, InboxGateway],
  exports: [RealtimeService]
})
export class RealtimeModule {}
