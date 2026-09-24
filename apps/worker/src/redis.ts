import IORedis from "ioredis";

export function createRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  // BullMQ requires this exact option to avoid dropping blocking commands.
  return new IORedis(url, { maxRetriesPerRequest: null });
}
