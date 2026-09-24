import IORedis from "ioredis";
import { REALTIME_CHANNEL, type InboxRealtimeEvent } from "@zenora/shared";

const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379");

export async function publishInboxEvent(event: InboxRealtimeEvent): Promise<void> {
  await redis.publish(REALTIME_CHANNEL, JSON.stringify(event));
}
