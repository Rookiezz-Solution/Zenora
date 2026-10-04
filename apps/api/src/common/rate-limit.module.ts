import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import IORedis from "ioredis";
import { loadEnv } from "../config/env";
import { setSharedCounter, type SharedCounter } from "./rate-limiter";

// Wires the Redis-backed counter into every RateLimiter that has a name, so
// rate limits hold when more than one API process is running.
@Injectable()
export class RedisRateLimitStore implements SharedCounter, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisRateLimitStore.name);
  private redis: IORedis | null = null;

  onModuleInit() {
    // Fail fast on a dead Redis instead of queueing commands: a limiter that
    // waits seconds for Redis is worse than one that falls back to local counting.
    this.redis = new IORedis(loadEnv().REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 2_000, commandTimeout: 1_000 });
    this.redis.on("error", (err) => this.logger.warn(`Rate-limit Redis error (using per-process limits): ${err.message}`));
    setSharedCounter(this);
  }

  async hit(key: string, windowMs: number): Promise<number> {
    if (!this.redis) throw new Error("not connected");
    const results = await this.redis.multi().incr(key).pttl(key).exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    const ttl = Number(results?.[1]?.[1] ?? -1);
    // First hit of a window, or a key somehow left without an expiry.
    if (count === 1 || ttl < 0) await this.redis.pexpire(key, windowMs);
    return count;
  }

  async onModuleDestroy() {
    setSharedCounter(null);
    await this.redis?.quit().catch(() => undefined);
  }
}

@Global()
@Module({ providers: [RedisRateLimitStore], exports: [RedisRateLimitStore] })
export class RateLimitModule {}
