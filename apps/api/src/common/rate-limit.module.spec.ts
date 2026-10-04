import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => {
  const exec = vi.fn();
  const instance = {
    on: vi.fn(),
    multi: vi.fn(() => ({ incr: () => ({ pttl: () => ({ exec }) }) })),
    pexpire: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue("OK")
  };
  return { exec, instance, ctor: vi.fn() };
});
vi.mock("ioredis", () => ({
  default: function (...args: unknown[]) {
    redis.ctor(...args);
    return redis.instance;
  }
}));
vi.mock("../config/env", () => ({ loadEnv: () => ({ REDIS_URL: "redis://localhost:6379" }) }));

import { RedisRateLimitStore } from "./rate-limit.module";
import { RateLimiter } from "./rate-limiter";

beforeEach(() => vi.clearAllMocks());

describe("RedisRateLimitStore", () => {
  it("starts the window on the first hit", async () => {
    const store = new RedisRateLimitStore();
    store.onModuleInit();
    redis.exec.mockResolvedValue([[null, 1], [null, -1]]);
    expect(await store.hit("rl:x:k", 60_000)).toBe(1);
    expect(redis.instance.pexpire).toHaveBeenCalledWith("rl:x:k", 60_000);
    await store.onModuleDestroy();
  });

  it("does not extend the window on later hits", async () => {
    const store = new RedisRateLimitStore();
    store.onModuleInit();
    redis.exec.mockResolvedValue([[null, 4], [null, 30_000]]);
    expect(await store.hit("rl:x:k", 60_000)).toBe(4);
    expect(redis.instance.pexpire).not.toHaveBeenCalled();
    await store.onModuleDestroy();
  });

  it("repairs a counter that was left without an expiry", async () => {
    const store = new RedisRateLimitStore();
    store.onModuleInit();
    redis.exec.mockResolvedValue([[null, 7], [null, -1]]);
    await store.hit("rl:x:k", 60_000);
    expect(redis.instance.pexpire).toHaveBeenCalled();
    await store.onModuleDestroy();
  });

  it("is used by named limiters once the module has started, and not after it stops", async () => {
    const store = new RedisRateLimitStore();
    store.onModuleInit();
    redis.exec.mockResolvedValue([[null, 99], [null, 1000]]);
    await expect(new RateLimiter(5, 60_000, "t").consume("k")).rejects.toThrow();
    await store.onModuleDestroy();
    await expect(new RateLimiter(5, 60_000, "t").consume("k2")).resolves.toBeUndefined();
  });

  it("connects with fail-fast options so a dead Redis cannot stall requests", () => {
    new RedisRateLimitStore().onModuleInit();
    expect(redis.ctor).toHaveBeenCalledWith("redis://localhost:6379", expect.objectContaining({ enableOfflineQueue: false, commandTimeout: 1_000 }));
  });
});
