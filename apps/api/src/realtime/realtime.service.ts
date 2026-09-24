import { Injectable, OnModuleDestroy } from "@nestjs/common";
import IORedis from "ioredis";
import { REALTIME_CHANNEL, type InboxRealtimeEvent } from "@zenora/shared";
import { loadEnv } from "../config/env";

// Publisher half of the inbox realtime bridge. apps/worker publishes here
// too (its own ioredis client, same channel/shape) for inbound messages;
// this side is used when an outbound send happens inside a request.
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly redis = new IORedis(loadEnv().REDIS_URL);

  async publish(event: InboxRealtimeEvent): Promise<void> {
    await this.redis.publish(REALTIME_CHANNEL, JSON.stringify(event));
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
