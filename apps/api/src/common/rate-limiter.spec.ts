import { HttpException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimiter, setSharedCounter } from "./rate-limiter";

afterEach(() => setSharedCounter(null));

describe("RateLimiter", () => {
  it("allows up to the limit per key, then refuses, independently per key", async () => {
    const limiter = new RateLimiter(3, 60_000);
    for (let i = 0; i < 3; i++) await limiter.consume("a");
    await expect(limiter.consume("a")).rejects.toThrow(HttpException);
    await expect(limiter.consume("b")).resolves.toBeUndefined();
  });

  it("forgets hits once the window has passed", async () => {
    vi.useFakeTimers();
    try {
      const limiter = new RateLimiter(1, 1_000);
      await limiter.consume("a");
      await expect(limiter.consume("a")).rejects.toThrow();
      vi.advanceTimersByTime(1_001);
      await expect(limiter.consume("a")).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("also counts in the shared store, under a namespaced key, so the limit holds across instances", async () => {
    const hit = vi.fn().mockResolvedValue(1);
    setSharedCounter({ hit });
    await new RateLimiter(5, 60_000, "login").consume("1.2.3.4");
    expect(hit).toHaveBeenCalledWith("rl:login:1.2.3.4", 60_000);
  });

  it("refuses when other instances have already used the allowance, even though this one has not", async () => {
    setSharedCounter({ hit: vi.fn().mockResolvedValue(6) });
    await expect(new RateLimiter(5, 60_000, "login").consume("1.2.3.4")).rejects.toThrow(HttpException);
  });

  it("falls back to the local count when the shared store is down (fails open)", async () => {
    setSharedCounter({ hit: vi.fn().mockRejectedValue(new Error("redis down")) });
    const limiter = new RateLimiter(2, 60_000, "login");
    await limiter.consume("k");
    await limiter.consume("k");
    await expect(limiter.consume("k")).rejects.toThrow(HttpException); // the local window still protects this process
  });

  it("does not use the shared store for a limiter without a name", async () => {
    const hit = vi.fn().mockResolvedValue(1);
    setSharedCounter({ hit });
    await new RateLimiter(5, 60_000).consume("k");
    expect(hit).not.toHaveBeenCalled();
  });
});
